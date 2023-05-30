import { Express, Request } from 'express';
import { Session, SessionData } from 'express-session';
import mysql from 'mysql2/promise';
import { ethers } from 'ethers';
import { Magic } from '@magic-sdk/admin';
import schedule from 'node-schedule';
import { Stripe } from 'stripe';

import { QueueProvider } from '../helpers/queue';
import { Heap } from '../helpers/heap';
import { Salesforce } from '../helpers/salesforce';

declare module 'express-session' {
  interface Session {
    user?: any;
  }
}

declare module 'express' {
  interface Request extends Express.Request {
    session: Session & Partial<SessionData>;
    sessionUser: any;
    user: any;
    sessionStore: any;
  }
}

declare global {
  namespace AIB {
    interface IRequest extends Request {
      session: Session & Partial<SessionData>;
      sessionStore: any;

      locals: {
        envs: IEnvironment;
        awsSNS: AWS.SNS;
        awsDynamoDBClient: AWS.DynamoDB;
        queueProvider: QueueProvider;
        maticProvider: ethers.providers.JsonRpcProvider;
        magicSDK: Magic;
        heap: Heap;
        stripe: Stripe;
        salesforce: Salesforce;
        dbPool: mysql.Pool;
        crons: {
          bCollectionCron: schedule.Job;
          bFactoryCron: schedule.Job;
          bPurchaseCron: schedule.Job;
        };
      };
    }
  }
}
