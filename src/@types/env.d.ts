declare global {
  namespace AIB {
    enum APP_ENV {
      LOCAL = 'local',
      DEV = 'dev',
      PROD = 'prod',
    }

    interface IEnvironment {
      appEnv: APP_ENV;
      appRegion: string;
      appPort: number;

      accessKeyId?: string;
      secretAccessKey?: string;

      appProtocol: string;
      appHostname: string;
      nftContract: string;
      nftContractV2: string;
      collectionManagerContract: string;
      frontendHostname: string;

      name: string;
      description: string;
      keywords: string;
      company: string;
      year: number;
      copyright: string;

      dbHost: string;
      dbPort: number;
      dbName: string;
      dbUser: string;
      dbPassword: string;

      dynamoHost?: string;

      notificationEnabled: boolean;
      notificationTable: string;

      redisHttpHost: string;
      redisHttpPort: number;
      redisPassword: string;
      redisQueuePrefix: string;
      redisQueueDB: string | number;

      sentryEnabled: boolean;
      sentryDSN: string;

      salesforceClientId: string;
      salesforceClientSecret: string;
      salesforceUser: string;
      salesforcePassword: string;
      salesforceHost: string;

      imgixKey: string;

      stripeApiKey: string;
      stripeWebhookSecret: string;

      magicKey: string;
      magicSecret: string;

      biconomyApiKey: string;
      managerGroupMemberSecret: string;
      maticRpcUrl: string;

      pinataKey: string;
      pinataSecret: string;
      pinataJWT: string;

      sendgridKey: string;

      slackNewCreatorUrl: string;
      slackNewPostUrl: string;
      slackNewImportUrl: string;
      isSlackAppEnabled: boolean;

      resourceBucket: string;

      logDays: string | number;

      maxUploadLimit: string;
      maxParameterLimit: number;

      isCORSEnabled: boolean;

      apiPrefix: string;

      jwtExpiresIn: number;
      jwtSecret: string;

      queueMonitorEnabled: boolean;
      queueMonitorHttpPort: string | number;

      heapAppID: string;

      urlboxKey: string;
    }
  }
}

export {};
