import { DynamoDB } from 'aws-sdk';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import { InboxMessageReturnType, NOTIFICATION_STATUS } from '../../interface/aib';
import HttpException from '../../exception/HttpException';

interface CREATE_INBOX_NOTIFICATION_ARGS {
  recipientUserId: string;
  postId: string;
  postTitle: string;
  appId: string;
}

class NotificationController {
  public static async _createNotification(awsDynamoDBClient: AWS.DynamoDB, data: CREATE_INBOX_NOTIFICATION_ARGS, envs: AIB.IEnvironment): Promise<any> {
    const {
      recipientUserId,
      postId,
      postTitle,
      appId,
      ...restData
    } = data;

    if (recipientUserId && postId && postTitle && appId) {
      const item = {
        user_id: recipientUserId.toString(),
        create_date: new Date().toISOString(),
        notification_id: uuidv4(),
        post_id: postId,
        post_title: postTitle,
        app_id: appId,
        notification_status: NOTIFICATION_STATUS.UNREAD,
        sent_as_single: false,
        ...restData,
      }

      const putItemParams: DynamoDB.PutItemInput = {
        TableName: envs.notificationTable,
        Item: DynamoDB.Converter.marshall(item),
      };

      await awsDynamoDBClient.putItem(putItemParams).promise();

      return item;
    } else {
      throw new HttpException(422, 'Invalid payload! Information is not valid for post notification')
    }
  }

  public static async createNotification(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/notifications'

    const { envs, awsDynamoDBClient } = req.locals;

    try {
      const createdItem = await this._createNotification(awsDynamoDBClient, req.body, envs);

      jsonResponse(res, null, createdItem);
    } catch (err) {
      jsonResponse(res, err, null);
    }
  }

  public static async getNotifications(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/notifications'
    const { envs, dbPool, awsDynamoDBClient } = req.locals;
    const user = req.sessionUser;

    try {
      const { lastEvaluatedKey, limit } = req.query;

      const getTotalCountParams: DynamoDB.QueryInput = {
        TableName: envs.notificationTable,
        Select: 'COUNT',
        ExpressionAttributeValues: {
          ':user_id': { S: user.id.toString()},
          ':notification_status': { S: NOTIFICATION_STATUS.DELETED }
        },
        KeyConditionExpression: 'user_id = :user_id',
        FilterExpression: 'notification_status <> :notification_status',
        ScanIndexForward: false,
      };
      const totalCount: DynamoDB.QueryOutput = await awsDynamoDBClient.query(getTotalCountParams).promise();

      const getUnreadCountParams: DynamoDB.QueryInput = {
        TableName: envs.notificationTable,
        Select: 'COUNT',
        ExpressionAttributeValues: {
          ':user_id': { S: user.id.toString()},
          ':notification_status': { S: NOTIFICATION_STATUS.UNREAD },
        },
        KeyConditionExpression: 'user_id = :user_id',
        FilterExpression: 'notification_status = :notification_status',
        ScanIndexForward: false,
      };
      const unreadCount: DynamoDB.QueryOutput = await awsDynamoDBClient.query(getUnreadCountParams).promise();

      const queryParams: DynamoDB.QueryInput = {
        TableName: envs.notificationTable,
        ExpressionAttributeValues: {
          ':user_id': { S: user.id.toString()},
          ':notification_status': { S: NOTIFICATION_STATUS.DELETED },
        },
        Limit: parseInt(limit as string, 10) || 10,
        KeyConditionExpression: 'user_id = :user_id',
        FilterExpression: 'notification_status <> :notification_status',
        ScanIndexForward: false,
      };

      if (lastEvaluatedKey) {
        const decodedLastEvaluatedKey: any = jwt.verify(lastEvaluatedKey as string, envs.jwtSecret);

        queryParams.ExclusiveStartKey = {
          user_id: decodedLastEvaluatedKey.user_id,
          create_date: decodedLastEvaluatedKey.create_date,
        };
      }

      const scanResponse: DynamoDB.QueryOutput = await awsDynamoDBClient.query(queryParams).promise();

      const entries: InboxMessageReturnType[] = await Promise.all(scanResponse.Items.map(async item => {
        const unmarshalled = DynamoDB.Converter.unmarshall(item);

        const apps = await database.readAppConfigsByIDs(dbPool, [unmarshalled.app_id]);

        const appStyle = JSON.parse(apps[0].style) || {};
        return {
          id: unmarshalled.notification_id,
          create_date: unmarshalled.create_date,
          read: unmarshalled.notification_status === NOTIFICATION_STATUS.READ,
          creator_app_id: unmarshalled.app_id,
          creator_profile_image: apps[0].profile_image,
          creator_subdomain: apps[0].subdomain,
          creator_name: apps[0].name,
          creator_background_color: appStyle.background_color,
          creator_secondary_color: appStyle.secondary_color,
          postID: unmarshalled.post_id,
          postTitle: unmarshalled.post_title,
        };
      }));

      const evaluatedKey = scanResponse.LastEvaluatedKey ? jwt.sign(scanResponse.LastEvaluatedKey, envs.jwtSecret, {
        expiresIn: `${envs.jwtExpiresIn}h` // Expires in hours
      }) : undefined;

      jsonResponse(res, null, {
        entries,
        evaluatedKey,
        totalCount: totalCount.Count,
        unreadCount: unreadCount.Count,
      });
    } catch (err) {
      jsonResponse(res, err, null);
    }
  }

  public static async getNotificationsUnreadCount(req: AIB.IRequest, res: Response): Promise<void> {
    // GET '/_/notifications/unread'
    const { envs, awsDynamoDBClient } = req.locals;
    const user = req.sessionUser;

    try {
      const getUnreadCountParams: DynamoDB.QueryInput = {
        TableName: envs.notificationTable,
        Select: 'COUNT',
        ExpressionAttributeValues: {
          ':user_id': { S: user.id.toString()},
          ':notification_status': { S: NOTIFICATION_STATUS.UNREAD },
        },
        KeyConditionExpression: 'user_id = :user_id',
        FilterExpression: 'notification_status = :notification_status',
        ScanIndexForward: false,
      };
      const unreadCount: DynamoDB.QueryOutput = await awsDynamoDBClient.query(getUnreadCountParams).promise();

      jsonResponse(res, null, unreadCount.Count);
    } catch (err) {
      jsonResponse(res, err, null);
    }
  }

  public static async getNotification(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/notifications/:id'
    const { envs, awsDynamoDBClient } = req.locals;
    const user = req.sessionUser;

    try {
      const { id: notificationId } = req.params;

      const queryParams: DynamoDB.QueryInput = {
        TableName: envs.notificationTable,
        ExpressionAttributeValues: {
          ':user_id': { S: user.id.toString()},
          ':notification_id': { S: notificationId },
        },
        KeyConditionExpression: 'user_id = :user_id',
        FilterExpression: 'notification_id = :notification_id',
        ScanIndexForward: false,
      }

      const response = await awsDynamoDBClient.query(queryParams).promise();

      const items = response.Items.map(item => DynamoDB.Converter.unmarshall(item));
      const item = items.find(item => item.user_id === user.id);

      if (item && item.status !== NOTIFICATION_STATUS.DELETED) {
        jsonResponse(res, null, item);
      } else {
        jsonResponse(res, new HttpException(404, 'Item not found!'), null);
      }
    } catch (err) {
      jsonResponse(res, err, null);
    }
  }

  public static async updateNotification(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/notifications/:id'
    const { envs, awsDynamoDBClient } = req.locals;
    const user = req.sessionUser;

    try {
      const { id: notificationId } = req.params;
      const { status } = req.body;

      if (status) {
        const queryParams: DynamoDB.QueryInput = {
          TableName: envs.notificationTable,
          ExpressionAttributeValues: {
            ':user_id': { S: user.id.toString()},
            ':notification_id': { S: notificationId },
          },
          KeyConditionExpression: 'user_id = :user_id',
          FilterExpression: 'notification_id = :notification_id',
          ScanIndexForward: false,
        }
  
        const response = await awsDynamoDBClient.query(queryParams).promise();
  
        const items = response.Items.map(item => DynamoDB.Converter.unmarshall(item));
        const item = items.find(item => item.user_id === user.id.toString());
  
        if (item) {
          const putItemParams: DynamoDB.PutItemInput = {
            TableName: envs.notificationTable,
            Item: DynamoDB.Converter.marshall({
              ...item,
              notification_status: status,
            }),
          };
  
          await awsDynamoDBClient.putItem(putItemParams).promise();
  
          const getItemParams: DynamoDB.GetItemInput = {
            TableName: envs.notificationTable,
            Key: {
              user_id: { S: item.user_id },
              create_date: { S: item.create_date },
            },
          }
  
          const { Item: updatedItem } = await awsDynamoDBClient.getItem(getItemParams).promise();
          const unmarshalled = DynamoDB.Converter.unmarshall(updatedItem);
          const returnItem = {
            id: unmarshalled.notification_id,
            status: unmarshalled.notification_status,
          };
  
          jsonResponse(res, null, returnItem);
        } else {
          jsonResponse(res, new HttpException(404, 'Item not found!'), null);
        }
      } else {
        jsonResponse(res, new HttpException(422, 'status not found!'), null);
      }
    } catch (err) {
      jsonResponse(res, err, null);
    }
  }
}

export default NotificationController;
