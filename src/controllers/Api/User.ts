import { Response } from 'express';
import mysql from 'mysql2/promise';

import { ACCESS_LEVEL, USER_STATUS } from '../../interface/aib';
import * as database from '../../helpers/database';
import * as blockchain from '../../helpers/blockchain';
import { QueueProvider } from '../../helpers/queue';
import { jsonResponse } from '../../helpers/response';
import { ACCOUNT_TYPE } from '../../helpers/salesforce';
import HttpException from '../../exception/HttpException';

class UserController {
  public static getAppEnv(req: AIB.IRequest, res: Response): void {
    // @GET '/_/test/isDev'
    const envs: AIB.IEnvironment = req.locals.envs;
    res.status(200).send(`env: ${envs.appEnv}`);
  }

  public static getSession(req: AIB.IRequest, res: Response): void {
    // @GET '/_/user/session'
    res.status(200).send(req.session);
  }

  public static getMagicKey(req: AIB.IRequest, res: Response): void {
    // @GET '/_/env'
    const envs: AIB.IEnvironment = req.locals.envs;
    jsonResponse(res, null, { magicKey: envs.magicKey });
  }

  public static async getUser(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/user'
    try {
      const dbPool: mysql.Pool = req.locals.dbPool;

      if (req.query.userIDs) {
        const users = await database.readUsersByIDs(dbPool, req.query.userIDs as string[]);
        // Delete the users sensitive information
        users.forEach(u => delete u.email_address);
        jsonResponse(res, null, users)
      } else if (req.query.sessionUser) {
        if (req.sessionUser.id) {
          const users = await database.readUsersByIDs(dbPool, [req.sessionUser.id]);
          jsonResponse(res, null, users);
        } else {
          jsonResponse(res, null, []);
        }
      } else {
        throw new HttpException(400, 'Invalid args');
      }
    }
    catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async setDisplayName(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/user/set-display-name'
    const userID = req.sessionUser.id;
    try {
      const dbPool: mysql.Pool = req.locals.dbPool;
      const name = req.body.displayName && req.body.displayName.trim().length > 0 ? req.body.displayName.trim() : null
      await database.updateUserDisplayName(dbPool, userID, req.body.displayName);

      jsonResponse(res, null, { displayName: req.body.displayName });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async acceptTermsAndConditions(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/user/accept-terms-conditions'
    try {
      const dbPool: mysql.Pool = req.locals.dbPool;

      try {
        await database.acceptTermsConditions(dbPool, req.sessionUser.id);
      } catch (error) {
        throw new HttpException(500, 'Failed accepting terms and conditions!');
      }

      const users = await database.readUsersByIDs(dbPool, [req.sessionUser.id]);
      if (users.length === 0) throw new HttpException(404, 'User not found!');

      jsonResponse(res, null, { terms_conditions_accepted_date: users[0].terms_conditions_accepted_date });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async loginWithMagic(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/user/loginWithMagic'
    try {
      const { dbPool, magicSDK, heap, queueProvider } = req.locals;

      const metadata = await magicSDK.users.getMetadataByToken(req.body.DIDToken);
      const email = metadata.email;
      const ethAddress = blockchain.validateAddress(metadata.publicAddress);

      const users = await database.readUsersByEmail(dbPool, email);

      if (users.length > 0) {
        if (users[0].status === 'PEND') {
          heap.track('create-user', users[0].id, {
            was_subscribed: true,
          });
          await database.confirmUser(dbPool, users[0].id, ethAddress);
        }

        req.session.user = {
          id: users[0].id,
          access: users[0].status === USER_STATUS.RSRT ? ACCESS_LEVEL.RESTRICTED : ACCESS_LEVEL.NORMAL,
        };

        jsonResponse(res, null, users);
      } else {
        // Create the user
        await database.createUser(dbPool, email, ethAddress);
        const users = await database.readUsersByEmail(dbPool, email);
        if (users.length == 0) {
          throw new HttpException(400, 'Unable to create account');
        } else {
          queueProvider.applySalesforce({
            userID: users[0].id,
            updates: {
              Cent_ID__c: `${users[0].id}`,
              LastName: email,
              PersonEmail: email,
              Create_Date_For_User__pc: users[0].create_date,
              Blockchain_Address__pc: ethAddress,
              Account_Type__c: ACCOUNT_TYPE.Subscriber,
            }
          });

          req.session.user = {
            id: users[0].id,
            access: users[0].status === USER_STATUS.RSRT ? ACCESS_LEVEL.RESTRICTED : ACCESS_LEVEL.NORMAL,
          };

          heap.track('create-user', users[0].id, {
            was_subscribed: false,
          });
          jsonResponse(res, null, users);
        }
      }
    }
    catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static logout(req: AIB.IRequest, res: Response): void {
    // @GET '/_/user/logout'
    req.session.destroy(() => {
      console.log('logged out');
    });
    jsonResponse(res, null, { status: 'OK' });
  }

  public static async sendUserFeedback(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/user/feedback', isAppUser
    try {
      const userID = req.sessionUser.id;
      const { feedback } = req.body;
      const dbPool: mysql.Pool = req.locals.dbPool;
      const queueProvider: QueueProvider = req.locals.queueProvider;

      const users = await database.readUsersByIDs(dbPool, [userID]);

      if (users.length < 1) throw new HttpException(404, 'User does not exist');

      const userEmail = users[0].email_address.toLowerCase();
      const appID = users[0].app_id;
      const appConfig = await database.readAppConfigsByIDs(dbPool, [appID]);
      const subdomain = appConfig[0].subdomain;
      const creatorName = appConfig[0].name;

      queueProvider.sendUserFeedbackEmail({
        creatorName,
        subdomain,
        userEmail,
        feedback
      });

      jsonResponse(res, null, 'Feedback submitted.');
    }
    catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default UserController;
