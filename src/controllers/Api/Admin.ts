import { Response } from 'express';
import { Readable } from 'stream';
import axios, { AxiosResponse } from 'axios';

import { USER_STATUS } from '../../interface/aib';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import HttpException from '../../exception/HttpException';

class AdminController {
  public static async runQuery(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/admin/query'
    const {
      query
    } = req.body;
    const { dbPool } = req.locals;
    try {
      const results = await database.executeQueryReadOnly(dbPool, (query || '') as string);
      jsonResponse(res, null, results);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async exportQuery(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/admin/query/export'
    const {
      query
    } = req.query;
    const { dbPool } = req.locals;
    try {
      const results = await database.executeQueryReadOnly(dbPool, (query || '') as string);
      const s = new Readable();
      s.pipe(res);
      const keys = Object.keys(results[0]);
      s.push(keys.join(','))
      results.forEach((result) => {
        s.push('\n' + keys.map(key => result[key]).join(','));
      });
      s.push(null);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getCreatorAnalytics(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/admin/creatoranalytics'
    const {
      subdomain,
      days,
    } = req.query;
    const { dbPool } = req.locals;
    try {
      const appConfig = await database.readAppConfigsBySubdomain(dbPool, subdomain as string);
      if (appConfig.length < 1) {
        throw new HttpException(404, 'App config not found');
      }
      const appID = appConfig[0].id;
      const totalSubscribers = await database.getNumberOfSubscribers(dbPool, appID as string);
      const newSubscribers = await database.getNumberOfNewSubscribers(dbPool, appID as string, days as string);
      const newPosts = await database.getNumberOfNewReleases(dbPool, appID as string, days as string);
      const newNFTsMinted = await database.getNumberOfNewMints(dbPool, appID as string, days as string);
      const newUnsubscribed = await database.getNumberOfNewUnsubscribe(dbPool, appID as string, days as string);

      const lastDaysText = `(Last ${days} days)`;

      const results = [
        {
          label: 'Total Subscribers',
          value: totalSubscribers,
        },
        {
          label: `# New Subscribers ${lastDaysText}`,
          value: newSubscribers,
        },
        {
          label: `# New Posts ${lastDaysText}`,
          value: newPosts,
        },
        {
          label: `# New NFTs minted ${lastDaysText}`,
          value: newNFTsMinted,
        },
        {
          label: `# New Unsubscribed ${lastDaysText}`,
          value: newUnsubscribed,
        }
      ];
      jsonResponse(res, null, results);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async retryClaims(req: AIB.IRequest, res: Response): Promise<void> {
    const { dbPool, queueProvider } = req.locals;
    try {
      // Get all tokens older than 1hr and not submitted
      const tokens = await database.readTokensForRetry(dbPool);
      tokens.forEach(t => queueProvider.mintToken({ tokenID: t.id }));
      jsonResponse(res, null, `${tokens.length} retried`);
    } catch (e) {
      console.log(e);
      jsonResponse(res, e, null);
    }
  }

  public static async queryQueueServer(req: AIB.IRequest, res: Response): Promise<void> {
    const { envs } = req.locals;
    const port = envs.queueMonitorHttpPort as string;
    const query = (req.query.query || '') as string;
    try {
      const response: AxiosResponse = await axios.get(
        `http://localhost:${port}/${decodeURIComponent(query)}`,
      );
      jsonResponse(res, null, response.data);
    } catch (e) {
      console.log(e);
      jsonResponse(res, e, null);
    }
  }

  public static async flushQueue(req: AIB.IRequest, res: Response): Promise<void> {
    const { queueProvider } = req.locals;
    queueProvider.flush();
    jsonResponse(res, null, 'OK');
  }

  public static async banUser(req: AIB.IRequest, res: Response): Promise<void> {
    const { email } = req.body;
    const { dbPool, queueProvider } = req.locals;
    try {
      const users = await database.readUsersByEmail(dbPool, email);
      if (users.length < 1) throw new HttpException(404, 'User does not exist');
      if (users[0].status === USER_STATUS.BNND) {
        return jsonResponse(res, null, users);
      }
      if (users[0].app_id) {
        await database.updateAppConfigStatus(dbPool, users[0].app_id, USER_STATUS.BNND);
      }
      await database.updateUserStatus(dbPool, users[0].id, USER_STATUS.BNND);
      const updatedUsers = await database.readUsersByIDs(dbPool, [users[0].id]);
      jsonResponse(res, null, updatedUsers);
    } catch (e) {
      console.log(e);
      jsonResponse(res, e, null);
    }
  }

  public static async getBannedUsers(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/admin/banned', isAdmin
    const {
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;

      const totalCount = await database.getNumberOfBannedUsers(dbPool);
      const bannedUserEntries = await database.readBannedUsersPaginated(dbPool, _offset, _limit);
      jsonResponse(res, null, {
        entries: bannedUserEntries,
        totalCount,
        count: bannedUserEntries.length,
        nextOffset: _offset + bannedUserEntries.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async flagUser(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/admin/flag', isAdmin
    const { email } = req.body;
    const { dbPool } = req.locals;

    try {
      const users = await database.readUsersByEmail(dbPool, email);

      if (users.length < 1) throw new HttpException(404, 'User does not exist');

      if (users[0].status === USER_STATUS.BNND || users[0].status === USER_STATUS.RSRT) {
        return jsonResponse(res, null, users);
      }

      if (users[0].app_id) {
        await database.updateAppConfigStatus(dbPool, users[0].app_id, USER_STATUS.RSRT);
      }
      await database.updateUserStatus(dbPool, users[0].id, USER_STATUS.RSRT);

      const updatedUsers = await database.readUsersByIDs(dbPool, [users[0].id]);
      jsonResponse(res, null, updatedUsers);
    } catch (e) {
      console.log(e);
      jsonResponse(res, e, null);
    }
  }

  public static async setPageAdult(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/admin/nsfw/page', isAdmin
    const {
      subdomain,
      adult,
    } = req.body;
    const { dbPool } = req.locals;

    try {
      // Check the post to ensure it exists
      const appConfigs = await database.readAppConfigsBySubdomain(dbPool, subdomain);
      if (appConfigs.length < 1) throw new HttpException(404, 'App not found');

      await database.updateAppAdult(dbPool, appConfigs[0].id as string, adult as boolean);
      const updatedApp = await database.readAppConfigsBySubdomain(dbPool, subdomain);
      jsonResponse(res, null, updatedApp);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getAdultPages(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/admin/nsfw/pages', isAdmin
    const {
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;

      const totalCount = await database.getNumberOfAdultPages(dbPool);
      const bannedUserEntries = await database.readAdultPagesPaginated(dbPool, _offset, _limit);
      jsonResponse(res, null, {
        entries: bannedUserEntries,
        totalCount,
        count: bannedUserEntries.length,
        nextOffset: _offset + bannedUserEntries.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default AdminController;
