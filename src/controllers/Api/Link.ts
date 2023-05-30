import { Response } from 'express';

import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import HttpException from '../../exception/HttpException';

class LinkController {
  public static async getLinks(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/link'
    const linkIDs = req.query.linkIDs;
    const { dbPool } = req.locals;

    try {
      const links = await database.readLinksByIDs(dbPool, linkIDs as string[]);

      jsonResponse(res, null, links);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async createLink(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/link', isAppUser
    const userID = req.sessionUser.id;
    const {
      label,
      url,
      image
    } = req.body;
    const { dbPool, heap } = req.locals;

    try {
      const users = await database.readUsersByIDs(dbPool, [userID]);

      if (users.length == 0 || !users[0].app_id) throw new HttpException(404, 'App not found');

      const appConfigID = users[0].app_id;

      const linkID = await database.createLink(dbPool, appConfigID, label, url, image);
      const links = await database.readLinksByIDs(dbPool, [linkID]);
      heap.track('create-link', userID, {
        app_id: appConfigID,
        link_id: linkID,
        link_url: url,
      });
      jsonResponse(res, null, links);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async updateLinks(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/link', isAppUser
    const linkData = req.body.links;
    const { dbPool } = req.locals;

    try {
      await database.updateLinks(dbPool, linkData);

      const links = await database.readLinksByIDs(dbPool, linkData.map(l => l.id));
      jsonResponse(res, null, links);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default LinkController;
