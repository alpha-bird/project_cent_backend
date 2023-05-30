import { Response } from 'express';

import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import HttpException from '../../exception/HttpException';
import { validateAndNormalizeEmail } from '../../utils/email_utils';

class WaitlistController {
  public static async getWaitlist(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/waitlist'
    const { email } = req.query;
    const { dbPool } = req.locals;

    try {
      if (email) {
        const waitlistEntry = await database.readCreatorWaitlistByEmail(dbPool, email as string);
        jsonResponse(res, null, waitlistEntry);
      } else {
        throw new HttpException(404, 'Email not found in waitlist');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async createWaitlistEntry(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/waitlist'
    const email = req.body.email;
    const name = req.body.name;
    const { dbPool, queueProvider } = req.locals;

    try {
      const validatedEmail = validateAndNormalizeEmail(email);

      if (!validatedEmail) throw new HttpException(400, 'Invalid email');

      const waitlistEntry = await database.readCreatorWaitlistByEmail(dbPool, validatedEmail);
      if (waitlistEntry.length > 0) {
        jsonResponse(res, null, waitlistEntry);
      } else {
        const newWaitlistEntryID = await database.createCreatorWaitlistEntry(dbPool, validatedEmail, name);
        const newWaitlistEntry = await database.readCreatorWaitlistByID(dbPool, newWaitlistEntryID);
        queueProvider.sendWaitlistEmail(validatedEmail);
        jsonResponse(res, null, newWaitlistEntry);
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async confirmWaitlistEntry(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/waitlist/conf', isAdmin
    const { email, name } = req.body;
    const { dbPool, queueProvider } = req.locals;

    try {
      if (!email) throw new HttpException(400, 'No email passed');
      const validatedEmail = validateAndNormalizeEmail(email);

      if (!validatedEmail) throw new HttpException(400, 'Invalid email');
      const waitlistEntry = await database.readCreatorWaitlistByEmail(dbPool, validatedEmail as string);

      const users = await database.readUsersByEmail(dbPool, validatedEmail);

      if (waitlistEntry[0] && waitlistEntry[0].status === 'CONF') {
        jsonResponse(res, null, 'This email has already been approved.');
      } else if (waitlistEntry[0] && waitlistEntry[0].status !== 'CONF') {
        await database.updateWaitlistStatus(dbPool, validatedEmail, 'CONF');
        queueProvider.sendApprovedWaitlistEmail(validatedEmail);
        queueProvider.applySalesforce({
          userID: users[0].id,
          updates: {
            App_Status_CONF__pc: new Date().toISOString()
          }
        });

        jsonResponse(res, null, 'Existing waitlist entry updated');
      } else {
        const newWaitlistEntryID = await database.createCreatorWaitlistEntry(dbPool, validatedEmail, name, 'CONF');
        const newWaitlistEntry = await database.readCreatorWaitlistByID(dbPool, newWaitlistEntryID);
        queueProvider.sendApprovedWaitlistEmail(validatedEmail);

        if (users.length > 0) {
          queueProvider.applySalesforce({
            userID: users[0].id,
            updates: {
              App_Status_CONF__pc: newWaitlistEntry[0].create_date
            }
          });
        }

        jsonResponse(res, null, 'New waitlist entry created');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getAdminWaitlist(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/admin/waitlist', isAdmin
    const {
      filter = 'PEND',
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;

      const totalCount = await database.getNumberOfWaitlistEntries(dbPool, filter as string);
      const waitlistEntries = await database.readCreatorWaitlistPaginated(dbPool, _offset, _limit, filter as string);
      jsonResponse(res, null, {
        entries: waitlistEntries,
        totalCount,
        count: waitlistEntries.length,
        nextOffset: _offset + waitlistEntries.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default WaitlistController;
