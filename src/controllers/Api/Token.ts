import { Response } from 'express';

import * as blockchain from '../../helpers/blockchain';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import HttpException from '../../exception/HttpException';
import { TRANSFER_STATUS, TRANSFER_STATUS_CODE } from '../../interface/aib';

class TokenController {
  public static async getTokens(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/token'
    const {
      userID,
      postIDs,
    } = req.query;
    const { dbPool } = req.locals;
  
    try {
      if (userID && postIDs) {
        const tokens = await database.readTokenByUserAndPostIDs(dbPool, userID as string, postIDs as string[]);
        jsonResponse(res, null, tokens);
      } else if (userID) {
        const tokens = await database.readTokenByUserID(dbPool, userID as string);
        jsonResponse(res, null, tokens);
      } else throw new HttpException(404, 'Tokens not found');
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getUserTokens(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/token/user'
    const userID = req.sessionUser.id;
    const {
      offset,
      limit,
      sort,
      appID,
    } = req.query;
    const { dbPool } = req.locals;
    try {
      if (!userID) throw new HttpException(404, 'No user found');
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;
      const _sort = sort || 'DESC';
      if (appID) {
        const totalCount = await database.getNumberOfUserTokensByApp(dbPool, userID as string, appID as string);
        const tokens = await database.readUserTokenByAppPaginated(dbPool, userID as string, appID as string, _sort as string, _offset, _limit);
        jsonResponse(res, null, {
          entries: tokens,
          totalCount,
          nextOffset: _offset + tokens.length,
        });
      } else {
        const totalCount = await database.getNumberOfUserTokens(dbPool, userID as string);
        const tokens = await database.readUserTokenPaginated(dbPool, userID as string, _sort as string, _offset, _limit);
        jsonResponse(res, null, {
          entries: tokens,
          totalCount,
          nextOffset: _offset + tokens.length,
        });
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async _getUserLimit(
    userID,
    dbPool,
  ): Promise<number> {
    try {
      if (!userID) throw new HttpException(404, 'No user found');
      const totalCollected = await database.getUserTokenForDay(dbPool, userID as string);
      return totalCollected;
    } catch (e) {
      throw new HttpException(500, e);
    }
  }

  public static async getUserLimit(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/token/user/limit'
    const userID = req.sessionUser.id;
    const {
      offset,
      limit,
      sort,
    } = req.query;
    const { dbPool } = req.locals;
    try {

      if (!userID) throw new HttpException(404, 'No user found');
      const collected = await TokenController._getUserLimit(userID, dbPool);
      jsonResponse(res, null, {
        collected: collected,
        collectLimit: 5,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getCollectedApps(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/token/apps'
    const userID = req.sessionUser.id;
    const {
      offset,
      limit,
      sort,
    } = req.query;
    const { dbPool } = req.locals;
    try {
      if (!userID) throw new HttpException(404, 'No user found');
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;
      const _sort = sort || 'ASC';
      const apps = await database.readCollectedApps(dbPool, userID as string, _sort as string, _offset, _limit);
      jsonResponse(res, null, {
        entries: apps,
        nextOffset: _offset + apps.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async transferTokenRequest(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/token/:tokenId/transfer', isAppUser
    const { tokenId } = req.params;
    const { dbPool, heap } = req.locals;
    const userID = req.sessionUser.id;

    try {
      const recipientAddress = blockchain.validateAddress(req.body.recipientAddress);
      if (!recipientAddress) throw new HttpException(400, 'Recipient address is not valid');

      const tokens = await database.readTokenByIDs(dbPool, [tokenId]);
      if (tokens.length > 0) {
        const token = tokens[0];
        const {
          id: tokenId,
          app_id: appId,
          source_id: postId,
          recipient_id,
          transfer_id,
          contract_address: tokenContract,
        } = token;

        if (userID !== recipient_id) throw new HttpException(401, 'You are not the owner of this token');
        if (transfer_id) throw new HttpException(401, 'Token already transferred');

        const posts = await database.readPostsByIDs(dbPool, [postId]);
        if (posts.length === 0) throw new HttpException(404, 'Post not found');

        let contractAddress = null;
        if (tokenContract) {
          contractAddress = tokenContract;
        }
        else if (posts[0].collection_id) {
          const collections = await database.readCollectionsByIDs(dbPool, [posts[0].collection_id]);
          if (collections.length === 0) throw new HttpException(404, 'Collection not found');
          contractAddress = collections[0].contract_address;
        }
        else {
          const appConfigs = await database.readAppConfigsByIDs(dbPool, [appId]);
          if (appConfigs.length === 0) throw new HttpException(404, 'Collection not found');
          contractAddress = appConfigs[0].nft_factory_address;
        }

        const transferId = await database.createTransfer(dbPool, tokenId, contractAddress, recipientAddress);
        heap.track('transfer-token', userID, {
          id: transferId,
          post_id: postId,
          app_id: appId,
        });
        jsonResponse(res, null, { transferId });

      } else throw new HttpException(404, 'Token not found');
    } catch (e) {
      console.log(e);
      jsonResponse(res, e, null);
    }
  }

  public static async updateTransferTokenStatus(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/token/:tokenId/transfer', isAppUser
    const { tokenId } = req.params;
    const {
      transferId,
      txnId,
      status,
    } = req.body;
    /*
      0: TRANSFER_STATUS.PENDING,
      1: TRANSFER_STATUS.COMPLETED,
      2: TRANSFER_STATUS.FAILED,
    */
    const { dbPool } = req.locals;
    const userID = req.sessionUser.id;

    try {
      if (status > 2 || status < 0) throw new HttpException(400, 'Invalid transfer status code');

      const tokens = await database.readTokenByIDs(dbPool, [tokenId]);
      const transfers = await database.readTransferByIDs(dbPool, [transferId]);

      if (tokens.length > 0) {
        const token = tokens[0];
        const {
          recipient_id,
          transfer_id,
        } = token;

        if (userID !== recipient_id) throw new HttpException(401, 'You are not the owner of this token');
        if (transfer_id) throw new HttpException(401, 'Token already transferred');
      } else throw new HttpException(404, 'Token not found');

      if (transfers.length > 0) {
        const transferStatus = TRANSFER_STATUS_CODE[status];
        await database.updateTransferByID(dbPool, transferId, txnId, transferStatus);
        if (transferStatus == TRANSFER_STATUS.COMPLETED) {
          // Update the token to prevent further transfer actions
          await database.updateTokenTransfer(dbPool, tokenId, transferId);
        }
        jsonResponse(res, null, { status: transferStatus });
      } else throw new HttpException(404, 'Transfer not found');
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
  public static async getTokenCollectors(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/token-collectors'
    const {
      appID,
      offset,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      if (appID) {
        const collectors = await database.getCollectorsByApp(dbPool, appID as string, offset as string);
        jsonResponse(res, null, {
          entries: collectors,
          count: collectors.length
        });
      } else throw new HttpException(404, 'appID not found');
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default TokenController;
