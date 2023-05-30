import AWS from 'aws-sdk';
import { Application } from 'express';
import { ethers } from 'ethers';
import { Magic } from '@magic-sdk/admin';
import { Stripe } from 'stripe';

import { getMaticProvider } from '../helpers/blockchain';
import { QueueProvider } from '../helpers/queue';
import { Heap } from '../helpers/heap';
import { Salesforce } from '../helpers/salesforce';
import { APP_ENV } from '../interface/app';
import Log from '../middlewares/Log';

class Providers {
  public static createQueueProvider (expressLocals: Record<string, any>): QueueProvider {
    return new QueueProvider(expressLocals);
  }

  public static getMaticProvider (envs: AIB.IEnvironment): ethers.providers.JsonRpcProvider {
    return getMaticProvider(envs.maticRpcUrl);
  }

  public static getMagic (envs: AIB.IEnvironment): Magic {
    return new Magic(envs.magicSecret);
  }

  public static createHeap (envs: AIB.IEnvironment): Heap {
    return new Heap(envs);
  }

  public static createStripe (envs: AIB.IEnvironment): Stripe {
    return new Stripe(envs.stripeApiKey, {
      apiVersion: '2022-08-01',
      maxNetworkRetries: 2,
      timeout: 1000,
    });
  }

  public static createSalesforce (envs: AIB.IEnvironment): Salesforce {
    return new Salesforce(envs);
  }

  // Initialize your providers
  public static init (_express: Application): Application {
    Log.info('Initialize the \'Providers\' ...');

    const envs: AIB.IEnvironment = _express.locals.envs;

    if (envs.appEnv ===  APP_ENV.LOCAL) {
      AWS.config.update({
        region: envs.appRegion,
        accessKeyId: envs.accessKeyId,
        secretAccessKey: envs.secretAccessKey,
      });
    } else {
      AWS.config.update({
        region: envs.appRegion,
      });
    }

    _express.locals.awsSNS = new AWS.SNS({apiVersion: '2010-03-31'});
    if (envs.appEnv ===  APP_ENV.LOCAL) {
      _express.locals.awsDynamoDBClient = new AWS.DynamoDB({
        apiVersion: '2012-08-10',
        endpoint: envs.dynamoHost,
      });
      // Create the table locally if it does not exist
      _express.locals.awsDynamoDBClient.createTable({
        TableName: envs.notificationTable,
        AttributeDefinitions: [
          { AttributeName: 'user_id', AttributeType: 'S'},
          { AttributeName: 'create_date', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'user_id', KeyType: 'HASH'},  // Partition key
          { AttributeName: 'create_date', KeyType: 'RANGE' },  // Sort key
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 50,
          WriteCapacityUnits: 50,
        },
      }).promise().catch(() => null);
    } else {
      _express.locals.awsDynamoDBClient = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
    }

    _express.locals.maticProvider = this.getMaticProvider(envs);
    _express.locals.magicSDK = this.getMagic(envs);
    _express.locals.heap = this.createHeap(envs);
    _express.locals.salesforce = this.createSalesforce(envs);
    _express.locals.queueProvider = this.createQueueProvider(_express.locals);
    _express.locals.stripe = this.createStripe(envs);

    return _express;
  }
}

export default Providers;
