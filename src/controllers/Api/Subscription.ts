import { Response } from 'express';
import { parse } from 'fast-csv';
import { Readable } from 'stream';
import mysql from 'mysql2/promise';
import { Heap } from '../../helpers/heap';
import { postSlackMessage } from '../../helpers/slack';

import { USER_STATUS } from '../../interface/aib';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import HttpException from '../../exception/HttpException';
import {
  getEmailColumnHeader,
  validateAndNormalizeEmail,
} from '../../utils/email_utils';

export async function createSubscriptionHelper(
  userID: string,
  appID: string,
  apiOverride: boolean,
  dbPool: mysql.Pool,
  heap: Heap
): Promise<mysql.RowDataPacket[]> {
  const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID]);

  if (appConfigs.length != 1) throw new HttpException(404, 'App not found');
  if (appConfigs[0].status === USER_STATUS.BNND || appConfigs[0].status === USER_STATUS.RSRT) throw new HttpException(400, 'Unable to subscribe to this app');

  const existingSubscription = await database.readSubscriptionsByAppAndSubscriber(dbPool, userID, appID);

  if (existingSubscription.length > 0) {
    return existingSubscription;
  } else {
    if (appConfigs[0].is_private && !apiOverride) throw new HttpException(400, 'Unable to subscribe to this app');
    else {
      const subscriptionID = await database.createSubscription(dbPool, userID, appID);
      const subscriptions = await database.readSubscriptionsByIDs(dbPool, [subscriptionID]);
      heap.track('subscribe-to-app', userID, {
        app_id: appID,
        app_subdomain: appConfigs[0].subdomain,
      });
      return subscriptions;
    }
  }
};

class SubscriptionController {
  public static async getSubscriptions(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/subscription'
    const {
      appID,
      subscriberID,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      if (appID && subscriberID) {
        const subscriptions = await database.readSubscriptionsByAppAndSubscriber(dbPool, subscriberID as string, appID as string);
        jsonResponse(res, null, subscriptions);
      } else if (subscriberID) {
        const subscriptions = await database.readSubscriptionsBySubscriberID(dbPool, subscriberID as string);
        jsonResponse(res, null, subscriptions);
      } else throw new HttpException(404, 'Subscriptions not found');
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async createSubscription(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/subscription', isAppUser, isUserBanned
    const userID = req.sessionUser.id;
    const appID = req.body.appID;
    const { dbPool, heap } = req.locals;

    try {
      const subscriptions = await createSubscriptionHelper(userID, appID, false, dbPool, heap);
      jsonResponse(res, null, subscriptions);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async validateSubscriptionImport(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/subscription/import/validate', isAppUser, isUserBanned, Uploader.generalUploader().single('file')
    try {
      if (req.file) {
        const buffer = req.file.buffer.toString('utf8');
        const emails = [];
        let emailField = null;
        let emailCount = 0;
        const errors: string[] = [];
  
        const stream = parse({
            headers: true,
            ignoreEmpty: true,
            discardUnmappedColumns: true
          })
          .on('headers', headers => {
            emailField = getEmailColumnHeader(headers);
            if (!emailField) {
              errors.push('No email field found in file');
            }
          })
          .on('error', error => errors.push(error.message))
          .on('data', row => {
            const validatedEmail = validateAndNormalizeEmail(row[emailField]);
            if (validatedEmail !== false && emails.includes(validatedEmail) === false) {
              emails.push(validatedEmail);
              emailCount++;
            }
          })
          .on('end', () =>  {
            if (errors.length > 0) {
              jsonResponse(res, new HttpException(400, errors.join(',')), null);
            } else {
              jsonResponse(res, null, emailCount);
            }
          });
  
        stream.write(buffer);
        stream.end();
      } else throw new HttpException(400, 'No file to validate');
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async importSubscription(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/subscription/import', isAppUser, isUserBanned, Uploader.generalUploader().single('file')
    const userID = req.sessionUser.id;
    let isSendingNotification = req.query.notification === 'true';
    const { envs, dbPool, heap, queueProvider } = req.locals;
    const {
      appProtocol,
      appHostname,
      slackNewImportUrl,
      isSlackAppEnabled,
    } = envs;

    try {
      if (req.file) {
        const user = await database.readUsersByIDs(dbPool, [userID]);

        if (user.length < 1) throw new HttpException(404, 'User does not have an app');
        if (!user[0].app_id) throw new HttpException(404, 'App config not found');

        const appID = user[0].app_id;
        const buffer = req.file.buffer.toString('utf8');
        const emails = [];
        let emailField = null;

        const stream = parse({
            headers: true,
            ignoreEmpty: true,
            discardUnmappedColumns: true
          })
          .on('headers', headers => {
            emailField = getEmailColumnHeader(headers);
            if (!emailField) {
              jsonResponse(res, new HttpException(400, 'No email field found in file'), null)
            }
          })
          .on('error', error => jsonResponse(res, new HttpException(400, error.message), null))
          .on('data', row => {
            const validatedEmail = validateAndNormalizeEmail(row[emailField]);
            if (validatedEmail !== false && emails.includes(validatedEmail) === false) {
              emails.push(validatedEmail);
            }
          })
          .on('end', async () =>  {
            const emailCount = emails.length;
            if (emailCount < 1) {
              jsonResponse(res, null, null);
            } else {
              let emailLocked = false;
              const totalImports = await database.getNumberOfEmailsImportedByAppID(dbPool, appID);
              if ((totalImports + emails.length) > 10000) {
                // Add slack message
                await database.updateAppConfigCanSendEmail(dbPool, appID, false);
                isSendingNotification = false;
                emailLocked = true;
              }
              queueProvider.importEmails({
                userID,
                emails,
                appID,
                isSendingNotification,
              });
              heap.track('import-email-subscribers', userID, {
                email_count: emailCount,
                app_id: appID,
              });
              if (isSlackAppEnabled) {
                const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID]);
                const pageLink = `${appProtocol}://${appConfigs[0].subdomain}.${appHostname}`;
                postSlackMessage(slackNewImportUrl, `${emailCount > 10000 || emailLocked ? `<!channel> ` : ''}${emailLocked ? 'ACCOUNT HAS BEEN LOCKED ' : ''}New email import by <${pageLink}|${appConfigs[0].subdomain}.cent.co>: ${emailCount} emails imported`)
              }
              jsonResponse(res, null, {
                status: 'success',
                emailLocked,
              });
            }
          });

        stream.write(buffer);
        stream.end();
      } else throw new HttpException(400, 'No file to validate');
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async exportSubscription(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/subscription/export'
    const { appID } = req.query;
    const { dbPool } = req.locals;

    try {
      if (appID) {
        const subscribers = await database.readSubscribersByAppID(dbPool, appID as string);

        const s = new Readable();
        s.pipe(res);
        const keys = Object.keys(subscribers[0]);
        s.push(keys.join(','))
        subscribers.forEach((result) => {
          s.push('\n' + keys.map(key => result[key]).join(','));
        });
        s.push(null);
      } else {
        throw new HttpException(404, 'Subscriptions not found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getSubscribers(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/subscribers'
    const {
      appID,
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      if (appID) {
        const _offset = parseInt(offset as string) || 0;
        const _limit = parseInt(limit as string) || 20;
  
        const totalCount = await database.getNumberOfSubscribers(dbPool, appID as string);
        const subscribers = await database.readSubscribersPaginated(dbPool, appID as string, _offset, _limit);
  
        jsonResponse(res, null, {
          subscribers,
          count: subscribers.length,
          totalCount,
          nextOffset: _offset + subscribers.length,
        });
      } else {
        throw new HttpException(404, 'Subscriptions not found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async unsubscribe(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/subscription/unsubscribe', isAppUser
    const userID = req.sessionUser.id;
    const { subscriptionID } = req.body;
    const { dbPool, heap } = req.locals;

    try {
      const subscription = await database.readSubscriptionsByIDs(dbPool, [subscriptionID]);

      if (subscription.length < 1 || subscription[0].subscriber_id !== userID) throw new HttpException(404, 'Subscription not found');
      else {
        await database.unsubscribe(dbPool, subscriptionID);

        const updatedSubscription = await database.readSubscriptionsByIDs(dbPool, [subscriptionID]);
        heap.track('unsubscribe-from-app', userID, {
          app_id: subscription[0].app_id,
          method: 'in-app',
        });
        jsonResponse(res, null, updatedSubscription);
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async unsubscribeEmail(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/subscription/unsubscribe/email'
    const {
      appID,
      email,
    } = req.body;
    const { dbPool, heap } = req.locals;

    try {
      const userToUnsubscribe = await database.readUsersByEmail(dbPool, email);

      if (userToUnsubscribe.length < 1) throw new HttpException(404, 'No user with email found');

      const subscription = await database.readSubscriptionsByAppAndSubscriber(dbPool, userToUnsubscribe[0].id, appID);

      if (subscription.length < 1 || subscription[0].subscriber_id !== userToUnsubscribe[0].id) {
        throw new HttpException(404, 'Subscription not found');
      } else {
        await database.unsubscribe(dbPool, subscription[0].id);

        const updatedSubscription = await database.readSubscriptionsByIDs(dbPool, [subscription[0].id]);
        heap.track('unsubscribe-from-app', userToUnsubscribe[0].id, {
          app_id: subscription[0].app_id,
          method: 'email',
        });
        jsonResponse(res, null, updatedSubscription);
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async subscribeToDigest(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/subscription/digest/subscribe'
    const { dbPool } = req.locals;

    try {
      await database.updateUserDigest(dbPool, req.sessionUser.id, true);

      jsonResponse(res, null, { success: true });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async unsubscribeFromDigest(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/subscription/digest/unsubscribe'
    const { email } = req.body;
    const { dbPool } = req.locals;

    try {
      const userToUnsubscribe = await database.readUsersByEmail(dbPool, email);

      if (userToUnsubscribe.length < 1) throw new HttpException(404, 'No user with email found');

      await database.updateUserDigest(dbPool, userToUnsubscribe[0].id, false);

      jsonResponse(res, null, { success: true });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default SubscriptionController;
