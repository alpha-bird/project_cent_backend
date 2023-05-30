import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import HttpException from '../../exception/HttpException';
import { isReserved, isValidSubdomain } from '../../utils/subdomain';
import AppConfigController from './AppConfig';

class InviteController {
  public static async getInvites(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/invite'
    const {
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;

      const totalCount = await database.getNumberOfInviteLinks(dbPool);
      const inviteEntries = await database.readInviteLinks(dbPool, _offset, _limit);
      jsonResponse(res, null, {
        entries: inviteEntries,
        totalCount,
        count: inviteEntries.length,
        nextOffset: _offset + inviteEntries.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
  public static async getInviteByCode(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/invite/code/:code'
    const code = req.params.code;
    const { dbPool } = req.locals;

    try {
      if (code) {
        const inviteLinks = await database.readInviteLinkByCode(dbPool, code as string);
        jsonResponse(res, null, inviteLinks);
      } else {
        throw new HttpException(404, 'No invite links found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getUserInvite(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/invite/user'
    const userID = req.sessionUser.id;
    const { dbPool } = req.locals;
    try {
      if (userID) {
        const inviteLinks = await database.readInviteLinkByUserID(dbPool, userID as string);
        jsonResponse(res, null, inviteLinks);
      } else {
        throw new HttpException(404, 'No invite links found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getInviteSignupTotal(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/invite/signup/total'
    const { linkID } = req.query;
    const { dbPool } = req.locals;

    try {
      const inviteLinks = await database.readInviteLinkByID(dbPool, [linkID] as string[]);
      if (inviteLinks.length < 1) throw new HttpException(404, 'No invite link associated with user');

      const totalCount = await database.getNumberOfSingupsByLinkID(dbPool, linkID as string);
      jsonResponse(res, null, { totalCount });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getInviteSignup(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/invite/signup'
    const {
      linkID,
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      const inviteLinks = await database.readInviteLinkByID(dbPool, [linkID] as string[]);
      if (inviteLinks.length < 1) throw new HttpException(404, 'No invite link associated with user');

      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;
      const totalCount = await database.getNumberOfSingupsByLinkID(dbPool, linkID as string);
      const signups = await database.readInviteSignupByLinkID(dbPool, linkID as string, _offset, _limit);
      jsonResponse(res, null, {
        entries: signups,
        totalCount,
        nextOffset: _offset + signups.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async _createInvite(
    dbPool,
    email: string,
  ): Promise<string> {
    const user = await database.readUsersByEmail(dbPool, email as string);
    if (user.length < 1) throw new HttpException(400, 'No user associated with this email');
    const existingInvite = await database.readInviteLinkByUserID(dbPool, user[0].id as string);
    if (existingInvite.length > 0) {
      return existingInvite[0].id;
    } else {
      const linkCode = uuidv4();
      const linkID = await database.createInviteLink(dbPool, user[0].id as number, linkCode as string);
      return linkID;
    }
  }


  public static async createInvite(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/invite'
    const { email } = req.body;
    const { dbPool } = req.locals;
    try {
      const linkID = await InviteController._createInvite(dbPool, email);
      const inviteLink = await database.readInviteLinkByID(dbPool, [linkID]);
      jsonResponse(res, null, inviteLink);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async _validateSignup(
    dbPool,
    linkID: string,
    email: string,
    subdomain: string,
  ): Promise<boolean> {
    // Check if invite link exists
    const existingInvite = await database.readInviteLinkByID(dbPool, [linkID] as string[]);
    if (existingInvite.length < 1) throw new HttpException(404, 'No invite link found');

    // Check if invite is valid
    if (existingInvite[0].is_expired) throw new HttpException(400, 'Invite link is invalid');

    // Check if the limit for invite link has been reached
    const existingSignupCount = await database.getNumberOfSingupsByLinkID(dbPool, linkID as string);
    const linkLimit = parseInt(existingInvite[0].signup_limit);
    if (existingSignupCount >= linkLimit) throw new HttpException(400, 'Signup limit has been reached for this link');
    if (!subdomain) throw new HttpException(400, 'Subdomain required to create an app');

    // Check if user already has an app config
    const signupUser = await database.readUsersByEmail(dbPool, email as string);
    if (signupUser.length > 0 && signupUser[0].app_id) throw new HttpException(400, 'This user already has an Cent Page');

    // Check if this subdomain already exists
    const appConfig = await database.readAppConfigsBySubdomain(dbPool, subdomain);
    if (appConfig.length > 0) throw new HttpException(400, 'This subdomain is already being used');

    // Check if subdomain is reserved and valid
    if (isReserved(subdomain)) throw new HttpException(400, 'This subdomain is reserved');
    if (!isValidSubdomain(subdomain)) throw new HttpException(400, 'Invalid subdomain');

    return true;
  }

  public static async createInviteSignup(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/invite/signup'
    const {
      userID,
      linkID,
      email,
      subdomain,
    } = req.body;
    const { dbPool } = req.locals;
    try {
      // Check if user exists
      const user = await database.readUsersByIDs(dbPool, [userID] as string[]);
      if (user.length < 1) throw new HttpException(404, 'No user found');

      // Validate signup
      const valid = await InviteController._validateSignup(
        dbPool,
        linkID,
        email,
        subdomain,
      );

      // Create new cent page
      const appID = await AppConfigController._createAppConfig(
        req.locals,
        userID,
        subdomain,
        true,
      );
      const newAppConfigs = await database.readAppConfigsByIDs(dbPool, [appID] as string[]);

      // Create new signup
      const signupID = await database.createInviteSignup(dbPool, userID as string, appID as string, linkID as string);
      const signup = await database.readInviteSignupByID(dbPool, signupID as string);

      // Create invite link for user
      await InviteController._createInvite(dbPool, email);

      jsonResponse(res, null, {
        appConfig: newAppConfigs[0],
        signup: signup[0],
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async validateInviteSignup(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/invite/signup/validate'
    const {
      linkID,
      email,
      subdomain,
    } = req.body;
    const { dbPool } = req.locals;

    try {
      const valid = await InviteController._validateSignup(
        dbPool,
        linkID,
        email,
        subdomain,
      );
      jsonResponse(res, null, { valid });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }



}

export default InviteController;
