import { Response, NextFunction } from 'express';

import ADMIN_EMAILS from '../constants/admins';
import { USER_STATUS, ACCESS_LEVEL } from '../interface/aib';
import * as database from '../helpers/database';
import { jsonResponse } from '../helpers/response';
import HttpException from '../exception/HttpException';

export const isAppUser = async (req: AIB.IRequest, res: Response, next: NextFunction): Promise<void> => {
  const { dbPool } = req.locals;

  try {
    if (req.sessionUser.id !== undefined) {
      const users = await database.readUsersByIDs(dbPool, [req.sessionUser.id]);

      if (users.length === 0) throw new HttpException(404, `User doesn't exist`);

      if (users[0].status === USER_STATUS.RSRT) {
        if (req.sessionUser.access === ACCESS_LEVEL.RESTRICTED) {
          req.sessionUser = {
            ...users[0],
            access: ACCESS_LEVEL.RESTRICTED,
          };
        } else {
          // destroy session
          req.session.destroy(() => {
            console.log('User access is restricted!');
          });

          throw new HttpException(401, 'Not authenticated');
        }
      } else {
        req.sessionUser = {
          ...users[0],
          access: ACCESS_LEVEL.NORMAL,
        };
      }

      next();
    } else throw new HttpException(401, 'Not authenticated');
  } catch (e) {
    jsonResponse(res, e, null);
  }
}

export const restrictAccess = async (req: AIB.IRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.sessionUser.access === ACCESS_LEVEL.RESTRICTED) {
      throw new HttpException(403, 'Access Denied');
    } else {
      next();
    }
  } catch (e) {
    jsonResponse(res, e, null);
  }
}

export const isAdmin = async (req: AIB.IRequest, res: Response, next: NextFunction): Promise<void> => {
  const { dbPool } = req.locals;

  try {
    if (req.sessionUser.id !== undefined) {
      const users = await database.readUsersByIDs(dbPool, [req.sessionUser.id]);

      if (users.length === 0) throw new HttpException(404, `User doesn't exist`);
      if (ADMIN_EMAILS.indexOf(users[0].email_address.toLowerCase()) < 0) throw new HttpException(401, `User doesn't have admin access`);

      req.sessionUser = {
        ...users[0],
        access: ACCESS_LEVEL.ADMIN,
      };

      next();
    } else throw new HttpException(401, 'Not authenticated');
  } catch (e) {
    jsonResponse(res, e, null);
  }
}

// IMPORTANT: must be chained after isAppUser or isAdmin checks
export const isUserBanned = async (req: AIB.IRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.sessionUser.status && req.sessionUser.status === USER_STATUS.BNND) {
      throw new HttpException(401, 'User not authorized to take action');
    }
    next();
  } catch (e) {
    jsonResponse(res, e, null);
  }
}
