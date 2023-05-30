import { Response } from 'express';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import HttpException from '../../exception/HttpException';

class AnalyticsController {
  public static async getPageAnalytics(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/analytics/general'
    const userID = req.sessionUser.id;
    const appID = req.sessionUser.app_id;
    const stripeID = req.sessionUser.stripe_id;
    const {
      days,
    } = req.query;
    const { dbPool } = req.locals;
    try {
      if (!appID) throw new HttpException(404, 'App not found');
      const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID as string]);
      if (appConfigs.length < 1) throw new HttpException(404, 'App not found');
      const appCreateDate = new Date(appConfigs[0].create_date);
      const today = new Date();
      const allTimeDays = Math.ceil((today.getTime() - appCreateDate.getTime())/ (1000 * database.DAY_INTERVAL));
      const dateRange: number = days ? parseInt(days as string) : allTimeDays;
      const hasPayments = Boolean(stripeID);
      const subscriberStats = await database.getSubscriberStats(dbPool, appID as string, dateRange as number, !days);
      const paymentStats = hasPayments
        ? await database.getPaymentStats(dbPool, appID as string, dateRange as number, !days)
        : null;

      jsonResponse(res, null, {
        subscribers: subscriberStats,
        payments: paymentStats,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
  public static async getPageCollectAnalytics(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/analytics/collect'
    const userID = req.sessionUser.id;
    const appID = req.sessionUser.app_id
    const {
      days,
    } = req.query;
    const { dbPool } = req.locals;
    try {
      if (!appID) throw new HttpException(404, 'App not found');
      const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID as string]);
      if (appConfigs.length < 1) throw new HttpException(404, 'App not found');
      const appCreateDate = new Date(appConfigs[0].create_date);
      const today = new Date();
      const allTimeDays = Math.ceil((today.getTime() - appCreateDate.getTime())/ (1000 * database.DAY_INTERVAL));
      const dateRange: number = days ? parseInt(days as string) : allTimeDays;
      const collectStats = await database.getCollectStats(dbPool, appID as string, dateRange as number);
      const collectorStats = await database.getCollectorStats(dbPool, appID as string, dateRange as number);

      jsonResponse(res, null, {
        collects: collectStats,
        collectors: collectorStats,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
  public static async getTopReleases(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/analytics/releases'
    const userID = req.sessionUser.id;
    const appID = req.sessionUser.app_id
    const {
      offset,
      limit,
      days,
    } = req.query;
    const { dbPool } = req.locals;
    try {
      if (!appID) throw new HttpException(404, 'App not found');
      const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID as string]);
      if (appConfigs.length < 1) throw new HttpException(404, 'App not found');

      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 5;

      const appCreateDate = new Date(appConfigs[0].create_date);
      const today = new Date();
      const allTimeDays = Math.ceil((today.getTime() - appCreateDate.getTime())/ (1000 * database.DAY_INTERVAL));
      const dateRange: number = days ? parseInt(days as string) : allTimeDays;

      const releases = await database.getTopReleases(dbPool, appID as string, dateRange, _limit, _offset);
      const totalCount = await database.getNumberOfNewReleases(dbPool, appID as string, dateRange);

      jsonResponse(res, null, {
        entries: releases,
        nextOffset: _offset + releases.length,
        totalCount,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default AnalyticsController;
