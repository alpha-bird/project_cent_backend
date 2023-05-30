import { Application } from 'express';
import path from 'path';
import dotenv from 'dotenv';

import { APP_ENV } from '../interface/app';

class Locals {
  /**
   * Makes env configs available for your app
   * throughout the app's runtime
   */
  public static config(): AIB.IEnvironment {
    dotenv.config({ path: path.join(__dirname, '../../.env') });

    const appEnv = Object.values(APP_ENV).includes(process.env.APP_ENV as APP_ENV) ?
      process.env.APP_ENV as APP_ENV : APP_ENV.DEV;

    const appRegion = process.env.APP_REGION || 'us-west-2';
    const appPort = process.env.APP_PORT ? parseInt(process.env.APP_PORT, 10) : 3500;

    const accessKeyId = process.env.ACCESS_KEY_ID;
    const secretAccessKey = process.env.SECRET_ACCESS_KEY;

    let appProtocol = 'http';
    let appHostname = '127-0-0-1.sslip.io:3000';
    let nftContract = '0x331AD1Bb922806d028D3FF2Dfe36A669334b48A9';
    let nftContractV2 = '0x1dcC83D8C75544b14660d751891fADb952f7794F';
    let collectionManagerContract = '0x7752878AEfDF456CcFD91ABc60C8F3ebc1d5EE9a';
    let frontendHostname = 'localhost:3000';

    if (appEnv === APP_ENV.DEV) {
      appProtocol = 'https';
      appHostname = 'v1.cent.dev';
      nftContract = '0x5dc9D56d93efA97a48302aB0871e44537DFd6616';
      nftContractV2 = '0x1dcC83D8C75544b14660d751891fADb952f7794F';
      collectionManagerContract = '0x7752878AEfDF456CcFD91ABc60C8F3ebc1d5EE9a';
      frontendHostname = 'v1.cent.dev'
    } else if (appEnv === APP_ENV.PROD) {
      appProtocol = 'https';
      appHostname = 'cent.co';
      nftContract = '0xA7486A29715eC18A816f9880285260342f9F7849';
      nftContractV2 = '0x853aC40B07E42a4952bC251De7024054C1794cC9';
      collectionManagerContract = '0x6D5E73Ed8EBC210aa8cc382716c1D399972FA884';
      frontendHostname = 'cent.co';
    }

    const name = process.env.APP_NAME || 'AIB Server';
    const description = process.env.APP_DESCRIPTION || 'Node.js Server for AIB';
    const keywords = process.env.APP_KEYWORDS || 'cent, aib, web-server, typescript-express, typescript, express, react';
    const company = process.env.COMPANY_NAME || 'Cent';
    const year = (new Date()).getFullYear();
    const copyright = `Copyright ${year} ${company} | All Rights Reserved`;

    const dbHost = process.env.MYSQL_DB_HOST;
    const dbPort = process.env.MYSQL_DB_PORT ? parseInt(process.env.MYSQL_DB_PORT, 10) : 3306;
    const dbName = process.env.MYSQL_DB_NAME;
    const dbUser = process.env.MYSQL_DB_USER || 'root';
    const dbPassword = process.env.MYSQL_DB_PASSWORD || '';

    const dynamoHost = process.env.DYNAMO_HOST;

    const notificationEnabled = process.env.NOTIFICATION_ENABLED === 'true';
    const notificationTable = process.env.NOTIFICATION_DYNAMODB_TABLE || '';

    const redisHttpHost = process.env.REDIS_SERVER_ADDRESS || '127.0.0.1';
    const redisHttpPort = process.env.REDIS_SERVER_PORT ? parseInt(process.env.REDIS_SERVER_PORT, 10) : 6379;
    const redisPassword = process.env.REDIS_SERVER_PASSWORD || '';
    const redisQueuePrefix = process.env.REDIS_QUEUE_PREFIX || 'q';
    const redisQueueDB = process.env.REDIS_QUEUE_DB || 3;

    const sentryEnabled = process.env.SENTRY_ENABLED === 'true';
    const sentryDSN = process.env.SENTRY_DSN;

    const salesforceClientId = process.env.SALESFORCE_CLIENT_ID;
    const salesforceClientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    const salesforceUser = process.env.SALESFORCE_USER;
    const salesforcePassword = process.env.SALESFORCE_PASSWORD;
    const salesforceHost = process.env.SALESFORCE_HOST;

    const imgixKey = process.env.IMGIX_KEY;

    const stripeApiKey = process.env.STRIPE_API_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    const magicKey = process.env.MAGIC_KEY;
    const magicSecret = process.env.MAGIC_SECRET;

    const biconomyApiKey = process.env.BICONOMY_API_KEY;
    const managerGroupMemberSecret = process.env.MANAGER_GROUP_MEMBER_SECRET;
    const maticRpcUrl = process.env.MATIC_RPC_URL;

    const pinataKey = process.env.PINATA_KEY;
    const pinataSecret = process.env.PINATA_SECRET;
    const pinataJWT = process.env.PINATA_JWT;

    const sendgridKey = process.env.SENDGRID_KEY;

    const slackNewCreatorUrl = process.env.SLACK_NEW_CREATOR_URL;
    const slackNewPostUrl = process.env.SLACK_NEW_POST_URL;
    const slackNewImportUrl = process.env.SLACK_NEW_IMPORT_URL || slackNewCreatorUrl;

    const isSlackAppEnabled = process.env.SLACK_APP_ENABLED === 'true';

    const resourceBucket = process.env.RESOURCE_BUCKET;

    const logDays = process.env.LOG_DAYS || 10;

    const maxUploadLimit = process.env.APP_MAX_UPLOAD_LIMIT || '50mb';
    const maxParameterLimit = process.env.APP_MAX_PARAMETER_LIMIT !== undefined ? parseInt(process.env.APP_MAX_PARAMETER_LIMIT, 10) : 50;

    const isCORSEnabled = process.env.CORS_ENABLED === 'true';

    const apiPrefix = process.env.API_PREFIX || 'api';

    const jwtExpiresIn = process.env.JWT_EXPIRES_IN !== undefined ? parseInt(process.env.JWT_EXPIRES_IN, 10) : 3;
    const jwtSecret = process.env.JWT_SECRET || 'This is your responsibility!';

    const queueMonitorEnabled = process.env.QUEUE_MONITOR_ENABLED === 'true';
    const queueMonitorHttpPort = process.env.QUEUE_MONITOR_PORT || 5550;

    const heapAppID = process.env.HEAP_APP_ID;

    const urlboxKey = process.env.URLBOX_KEY;

    return {
      appEnv,
      appRegion,
      appPort,

      accessKeyId,
      secretAccessKey,

      appProtocol,
      appHostname,
      nftContract,
      nftContractV2,
      collectionManagerContract,
      frontendHostname,

      name,
      description,
      keywords,
      company,
      year,
      copyright,

      dbHost,
      dbPort,
      dbName,
      dbUser,
      dbPassword,

      dynamoHost,

      notificationEnabled,
      notificationTable,

      redisHttpHost,
      redisHttpPort,
      redisPassword,
      redisQueuePrefix,
      redisQueueDB,

      sentryEnabled,
      sentryDSN,

      salesforceClientId,
      salesforceClientSecret,
      salesforceUser,
      salesforcePassword,
      salesforceHost,

      imgixKey,

      stripeApiKey,
      stripeWebhookSecret,

      magicKey,
      magicSecret,

      biconomyApiKey,
      managerGroupMemberSecret,
      maticRpcUrl,

      pinataKey,
      pinataSecret,
      pinataJWT,

      sendgridKey,

      slackNewCreatorUrl,
      slackNewPostUrl,
      slackNewImportUrl,
      isSlackAppEnabled,

      resourceBucket,

      logDays,

      maxUploadLimit,
      maxParameterLimit,

      isCORSEnabled,

      apiPrefix,

      jwtExpiresIn,
      jwtSecret,

      queueMonitorEnabled,
      queueMonitorHttpPort,

      heapAppID,

      urlboxKey,
    };
  }

  /**
   * Injects your config to the app's locals
   */
  public static init (_express: Application): Application {
    _express.locals.envs = this.config();
    return _express;
  }
}

export default Locals;
