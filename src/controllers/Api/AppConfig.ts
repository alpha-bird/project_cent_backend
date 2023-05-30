import { Response } from 'express';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import { ACCOUNT_TYPE } from '../../helpers/salesforce';
import { postSlackMessage } from '../../helpers/slack';
import { replaceImgUrlWithImgix } from '../../helpers/imgix';
import HttpException from '../../exception/HttpException';
import { APP_ENV } from '../../interface/app';

import { isReserved, isValidSubdomain } from '../../utils/subdomain';

class AppConfigController {
  public static async getAppConfig(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/appConfig'
    const {
      appConfigIDs,
      creatorID,
      subdomain,
      imgixWidth,
    } = req.query;
    const { dbPool, envs } = req.locals;

    const width: number = parseInt(imgixWidth as string || '1024');

    const updateAppConfigsWithImgix = (appConfigs) => {
      appConfigs.forEach((ac) => {
        if (ac.background_image) {
          ac.background_image_imgix = replaceImgUrlWithImgix(
            envs.appEnv,
            envs.imgixKey,
            ac.background_image,
            width,
            null,
          );
        }
      });
      return appConfigs;
    };

    try {
      if (appConfigIDs) {
        const appConfigs = await database.readAppConfigsByIDs(dbPool, appConfigIDs as string[]);
        jsonResponse(res, null, updateAppConfigsWithImgix(appConfigs));
      } else if (creatorID) {
        const users = await database.readUsersByIDs(dbPool, [creatorID] as string[]);
        if (users.length == 0 || !users[0].app_id) {
          throw new HttpException(404, 'App not found');
        }

        const appConfigs = await database.readAppConfigsByIDs(dbPool, [users[0].app_id] as string[]);
        jsonResponse(res, null, updateAppConfigsWithImgix(appConfigs));
      } else if (subdomain) {
        const appConfigs = await database.readAppConfigsBySubdomain(dbPool, subdomain as string);
        if (appConfigs.length === 0 && isReserved(subdomain as string)) {
          jsonResponse(res, null, [{ isReserved: true }]);
        } else {
          jsonResponse(res, null, updateAppConfigsWithImgix(appConfigs));
        }
      } else {
        throw new HttpException(404, 'App config not found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getRecentlyCollectedApps(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/appConfig/recently-collected'
    const {
      userID,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      if (userID) {
        const appConfigs = await database.getAppsRecentlyCollectedByUser(dbPool, userID as string);
        jsonResponse(res, null, appConfigs);
      } else {
        throw new HttpException(404, 'userID not found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async _createAppConfig(
    locals,
    userID,
    subdomain,
    withInvite = false,
  ): Promise<string> {
    const { envs, dbPool, heap, queueProvider } = locals;
    const {
      appProtocol,
      appHostname,
      appEnv,
      slackNewCreatorUrl,
      isSlackAppEnabled,
    } = envs;

    const users = await database.readUsersByIDs(dbPool, [userID]);

    // 1. Create a new app with placeholder as subdomain, subdomain as name
    const appID = await database.createAppConfig(dbPool, userID, subdomain, subdomain);

    // 2. Update the user `app_id` with the new app_id
    await database.updateUserAppConfig(dbPool, userID, appID);

    // 3. Add default view campaign history link to new app config
    const campaignHistoryURL = `${appProtocol}://${subdomain}.${appHostname}/releases`;
    const linkID = await database.createLink(dbPool, appID, "My Releases", campaignHistoryURL);
    const style = JSON.stringify({
      primary_color: null,
      secondary_color: null,
      links: [linkID],
    });
    await database.updateAppConfigStyle(dbPool, appID, style);

    // 4. Auto subscribe penny to the new app config
    if (appEnv === APP_ENV.PROD) {
      await database.createSubscription(dbPool, '2111', appID);
    }
    const newAppConfigs = await database.readAppConfigsByIDs(dbPool, [appID] as string[]);
    const appSubdomain = newAppConfigs[0].subdomain;
    if (isSlackAppEnabled) {
      const appLink = `${appProtocol}://${appSubdomain}.${appHostname}`;
      postSlackMessage(slackNewCreatorUrl, `New cent.co created by ${users[0].email_address}: <${appLink}|${appSubdomain}.cent.co>`);
    }

    queueProvider.applySalesforce({
      userID,
      updates: {
        Account_Type__c: ACCOUNT_TYPE.Creator,
        App_ID__pc: appID,
        Subdomain__pc: newAppConfigs[0].subdomain,
        pages_url__pc: `https://${newAppConfigs[0].subdomain}.cent.co`,
        Pages_User_Display_Name__pc: newAppConfigs[0].name,
        App_Status_SUB__pc: newAppConfigs[0].create_date
      }
    });

    heap.track('create-app-config', userID, {
      subdomain: appSubdomain,
      app_id: appID,
      with_invite: withInvite,
    });
    const waitlistEntry = await database.readCreatorWaitlistByEmail(dbPool, users[0].email_address);
    return appID;
  }

  public static async createAppConfig(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/appConfig', isAppUser, isUserBanned
    const userID = req.sessionUser.id;
    const userAppID = req.sessionUser.app_id;
    const { subdomain } = req.body;
    const { dbPool } = req.locals;
    try {
      if (!subdomain) throw new HttpException(400, 'Subdomain required to create an app');

      const appConfig = await database.readAppConfigsBySubdomain(dbPool, subdomain);

      if (appConfig.length > 0) throw new HttpException(400, 'This subdomain is already being used');
      if (isReserved(subdomain)) throw new HttpException(400, 'This subdomain is reserved');
      if (!isValidSubdomain(subdomain)) throw new HttpException(400, 'Invalid subdomain');

      const users = await database.readUsersByIDs(dbPool, [userID]);

      if (userAppID) {
        const appConfigs = await database.readAppConfigsByIDs(dbPool, [userAppID]);
        jsonResponse(res, null, appConfigs);
      }
      else {
        // 1. Create a new app with placeholder as subdomain, subdomain as name
        const appID = await AppConfigController._createAppConfig(
          req.locals,
          userID,
          subdomain,
          false,
        );
        const newAppConfigs = await database.readAppConfigsByIDs(dbPool, [appID] as string[]);
        jsonResponse(res, null, newAppConfigs);
      }
    } catch (e) {
      console.log(`APPCREATION_ERROR: ${e.message}`);
      console.log(e);
      jsonResponse(res, e, null);
    }
  }

  public static async getAdminAppConfig(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/admin/appConfig', isAdmin
    const {
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;
  
    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;
  
      const totalCount = await database.getNumberOfAppConfigEntries(dbPool);
      const appConfigEntries = await database.readAppConfigsPaginated(dbPool, _offset, _limit);

      jsonResponse(res, null, {
        entries: appConfigEntries,
        totalCount,
        count: appConfigEntries.length,
        nextOffset: _offset + appConfigEntries.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async updateAppConfig(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/appConfig', isAppUser, isUserBanned
    const userID = req.sessionUser.id;
    const {
      name,
      description,
      profile_image,
      style,
      social_links,
      background_image
    } = req.body;
    const { dbPool, heap, queueProvider } = req.locals;

    try {
      const users = await database.readUsersByIDs(dbPool, [userID]);

      if (users.length == 0 || !users[0].app_id) throw new HttpException(404, 'App not found');

      const appConfigID = users[0].app_id;
      const currentAppConfig = await database.readAppConfigsByIDs(dbPool, [appConfigID]);
      await database.updateAppConfig(dbPool, appConfigID, name, description, profile_image, style, social_links, background_image);
      if (currentAppConfig.length > 0 && profile_image !=='/user-icon.png' && currentAppConfig[0].profile_image === '/user-icon.png') {
        queueProvider.applySalesforce({
          userID,
          updates: {
            App_Status_STYLED__pc: new Date().toISOString(),
            Pages_User_Display_Name__pc: name,
          }
        });
      }

      const newAppConfigs = await database.readAppConfigsByIDs(dbPool, [appConfigID]);

      heap.track('update-app-config', userID, {
        subdomain: newAppConfigs[0].subdomain,
        app_id: appConfigID,
      });
      jsonResponse(res, null, newAppConfigs);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async enableAppConfigCanSend(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/admin/appConfig/cansend', isAdmin, isUserBanned
    const {
      email,
    } = req.body;
    const { dbPool, heap, queueProvider } = req.locals;
    try {
      const users = await database.readUsersByEmail(dbPool, email);

      if (users.length == 0 || !users[0].app_id) throw new HttpException(404, 'App not found');

      const appConfigID = users[0].app_id;
      await database.updateAppConfigCanSendEmail(dbPool, appConfigID, true);
      jsonResponse(res, null, {status: 'success'});
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default AppConfigController;
