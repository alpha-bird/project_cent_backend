import { DynamoDB } from 'aws-sdk';
import { ethers } from 'ethers';
import { Magic } from '@magic-sdk/admin';
import schedule from 'node-schedule';
import mysql from 'mysql2/promise';
import SendGrid from '@sendgrid/mail';
import querystring from 'querystring';
import { v4 as uuidv4 } from 'uuid';

import * as blockchain from './blockchain';
import * as database from './database';
import { Heap } from './heap';
import { Salesforce, ISalesforceAccount } from './salesforce';
import Queue from '../providers/Queue';
import {
  feedbackEmailBody,
  transformPostForEmail,
  APPROVED_WAITLIST_EMAIL_BODY,
  APPROVED_WAITLIST_EMAIL_TEXT,
  WAITLIST_EMAIL_TEXT,
  WAITLIST_EMAIL_BODY,
  subscriptionEmailBody,
  subscriptionText,
} from '../utils/email_utils';
import { NOTIFICATION_STATUS } from '../interface/aib';

interface SEND_EMAIL_ARGS {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

interface SEND_APP_NOTIFICATION_PARAMS {
  offset: number;
  emailCampaignID: string;
  primaryColor: string;
  secondaryColor: string;
  subdomain: string;
  appName: string;
  appID: string;
  postID: string;
}

interface SEND_SUBSCRIPTION_NOTIFICATION_PARAMS {
  offset: number;
  emailImportID: string;
  subdomain: string;
  appName: string;
  appID: string;
}

interface IMPORT_EMAILS_PARAMS {
  userID: string;
  emails: string[];
  appID: string;
  isSendingNotification: boolean;
}

interface SEND_USER_FEEBACK_PARAMS {
  creatorName: string;
  subdomain: string;
  feedback: string;
  userEmail: string;
}

interface MINT_TOKEN_ARGS {
  tokenID: string;
}

interface APPLY_SALESFORCE_ARGS {
  userID: string;
  updates: ISalesforceAccount;
}

interface APPLY_SALESFORCE_BY_STRIPE_ARGS {
  stripeID: string;
  updates: ISalesforceAccount;
}

interface APPLY_MULTI_SALESFORCE_ARGS {
  infos: APPLY_SALESFORCE_ARGS[];
}

interface CREATE_INBOX_NOTIFICATIONS_ARGS {
  offsetId: number;
  postId: string;
  creatorName: string;
  pageURL: string;
  postTitle: string;
  postImage: string;
  appId: string;
  sentAsSingle: boolean;
  notificationSent: boolean;
}

export class QueueProvider {
  /**
   * Create the express object
   */
  envs: AIB.IEnvironment;
  maticProvider: ethers.providers.JsonRpcProvider;
  magicSDK: Magic;
  heap: Heap;
  salesforce: Salesforce;
  dbPool: mysql.Pool;
  awsDynamoDBClient: AWS.DynamoDB;
  crons: {
    bCollectionCron: schedule.Job;
    bFactoryCron: schedule.Job;
    bPurchaseCron: schedule.Job;
  };
  sendLimit: number;
  appNotifyDbLimit: number;

  constructor(expressLocals: Record<string, any>) {
    this.envs = expressLocals.envs;
    this.maticProvider = expressLocals.maticProvider;
    this.magicSDK = expressLocals.magicSDK;
    this.heap = expressLocals.heap;
    this.salesforce = expressLocals.salesforce;
    this.dbPool = expressLocals.dbPool;
    this.awsDynamoDBClient = expressLocals.awsDynamoDBClient;
    this.crons = expressLocals.crons;
    this.sendLimit = 1000; // Limit set by sendgrid
    this.appNotifyDbLimit = 25; // Limit set by Dynamo

    SendGrid.setApiKey(this.envs.sendgridKey);

    Queue.process('sendEmail', 1, this._sendEmail.bind(this));
    Queue.process('sendAppNotitifcations', 1, this._sendAppNotitifcations.bind(this));
    Queue.process('sendSubscriptionNotifications', 1, this._sendSubscriptionNotifications.bind(this));
    Queue.process('sendWaitlistEmail', 1, this._sendWaitlistEmail.bind(this));
    Queue.process('sendApprovedWaitlistEmail', 1, this._sendApprovedWaitlistEmail.bind(this));
    Queue.process('sendUserFeedbackEmail', 1, this._sendUserFeedbackEmail.bind(this));
    Queue.process('importEmails', 1, this._importEmails.bind(this));
    Queue.process('mintToken', 1, this._mintToken.bind(this));
    Queue.process('applySalesforce', 1, this._applySalesforce.bind(this));
    Queue.process('applySalesforceByStripeId', 1, this._applySalesforceByStripeId.bind(this));
    Queue.process('applyMultiSalesforce', 1, this._applyMultiSalesforce.bind(this));
    Queue.process('createInboxNotifications', 5, this._createInboxNotifications.bind(this));
  }

  public flush(): void {
    Queue.flush();
  }

  public sendEmail(args: SEND_EMAIL_ARGS): void {
    Queue.create('sendEmail', 1, args);
  }

  public sendAppNotitifcations(args: SEND_APP_NOTIFICATION_PARAMS): void {
    Queue.create('sendAppNotitifcations', 5, args);
  }

  public sendWaitlistEmail(_to: string): void {
    Queue.create('sendWaitlistEmail', 1, { to: _to });
  }

  public sendApprovedWaitlistEmail(_to: string): void {
    Queue.create('sendApprovedWaitlistEmail', 1, { to: _to });
  }

  public sendUserFeedbackEmail(args: SEND_USER_FEEBACK_PARAMS): void {
    Queue.create('sendUserFeedbackEmail', 1, args);
  }

  public importEmails(args: IMPORT_EMAILS_PARAMS): void {
    Queue.create('importEmails', 1, args);
  }

  public mintToken(args: MINT_TOKEN_ARGS): void {
    Queue.create('mintToken', 5, args);
  }

  public applySalesforce(args: APPLY_SALESFORCE_ARGS): void {
    Queue.create('applySalesforce', 2, args);
  }

  public applySalesforceByStripeId(args: APPLY_SALESFORCE_BY_STRIPE_ARGS): void {
    Queue.create('applySalesforceByStripeId', 1, args);
  }

  public applyMultiSalesforce(args: APPLY_MULTI_SALESFORCE_ARGS): void {
    Queue.create('applyMultiSalesforce', 2, args);
  }

  public createInboxNotifications(args: CREATE_INBOX_NOTIFICATIONS_ARGS): void {
    Queue.create('createInboxNotifications', 5, args);
  }

  private sendSubscriptionNotifications(args: SEND_SUBSCRIPTION_NOTIFICATION_PARAMS): void {
    Queue.create('sendSubscriptionNotifications', 1, args);
  }

  private async _sendEmail(data: SEND_EMAIL_ARGS): Promise<void> {
    const {
      to,
      from,
      replyTo,
      subject,
      text,
      html,
    } = data;
    await SendGrid.send({
      to,
      from,
      replyTo,
      subject,
      text,
      html,
    });
  }

  private async _sendAppNotitifcations(data: SEND_APP_NOTIFICATION_PARAMS): Promise<void> {
    const {
      appProtocol,
      appHostname,
      appEnv,
    } = this.envs;
    const {
      offset,
      emailCampaignID,
      primaryColor,
      secondaryColor,
      subdomain,
      appName,
      appID,
      postID,
    } = data;

    const posts = await database.readPostsByIDs(this.dbPool, [postID]);
    if (posts.length == 0) {
      console.log(`No post found with id: ${postID}`);
      return;
    }
    const postTitle = posts[0].title;
    const postBody = posts[0].body;
    const postSupply = posts[0].token_supply_cap;

    const subscriptions = await database.readSubscriptionsActiveByAppIDPaginated(
      this.dbPool,
      appID,
      offset,
      this.sendLimit
    );

    if (subscriptions.length > 0) {
      const emailBody = transformPostForEmail(
        postBody,
        postTitle,
        subdomain,
        appName,
        appProtocol,
        appHostname,
        appEnv,
        postSupply,
        primaryColor,
        secondaryColor,
      );

      const subscriberIDs = subscriptions.map(s => s.subscriber_id);
      const subscribers = await database.readUsersByIDs(this.dbPool, subscriberIDs);
      const personalizations = subscribers.map(s => ({
        to: s.email_address,
        substitutions: {
          UNSUB_KEY: querystring.stringify({ ai: appID, ue: s.email_address })
        }
      }));

      const displayName = appName || `${subdomain}.cent.co`;
      await SendGrid.send({
        personalizations,
        from: `${subdomain}@mail.cent.co`,
        replyTo: `no-reply+${subdomain}@cent.co`,
        subject: `${displayName}: ${postTitle}`,
        text: `New NFT from ${displayName}`,
        html: emailBody,
      });
      this.sendAppNotitifcations({
        offset: offset + this.sendLimit,
        emailCampaignID,
        primaryColor,
        secondaryColor,
        subdomain,
        appName,
        appID,
        postID,
      });
    }
    await database.updateEmailCampaignSendTotalAndStatus(this.dbPool, emailCampaignID, subscriptions.length);
  }

  private async _sendSubscriptionNotifications(data: SEND_SUBSCRIPTION_NOTIFICATION_PARAMS): Promise<void> {
    const {
      appProtocol,
      appHostname,
    } = this.envs;
    const {
      offset,
      emailImportID,
      subdomain,
      appName,
      appID,
    } = data;

    const subscriptions = await database.readSubscriptionsActiveByEmailImportIDPaginated(
      this.dbPool,
      emailImportID,
      offset,
      this.sendLimit
    );

    if (subscriptions.length > 0) {
      const subscriberIDs = subscriptions.map(s => s.subscriber_id);
      const subscribers = await database.readUsersByIDs(this.dbPool, subscriberIDs);
      const personalizations = subscribers.map(s => ({
        to: s.email_address,
        substitutions: {
          UNSUB_KEY: querystring.stringify({ ai: appID, ue: s.email_address })
        }
      }));

      await SendGrid.send({
        personalizations,
        from: `${subdomain}@mail.cent.co`,
        replyTo: 'no-reply@cent.co',
        subject: `You have been subscribed to ${appName} at ${subdomain}.cent.co`,
        text: subscriptionText(appProtocol, appHostname, appName, subdomain),
        html: subscriptionEmailBody(appProtocol, appHostname, appName, subdomain),
      });
      this.sendSubscriptionNotifications({
        offset: offset + this.sendLimit,
        emailImportID,
        subdomain,
        appName,
        appID,
      });
    }
  }

  private async _sendWaitlistEmail(data): Promise<void> {
    const { to } = data;
    await SendGrid.send({
      to: to,
      from: 'cent@cent.co',
      subject: 'You\'re on the waitlist!',
      text: WAITLIST_EMAIL_TEXT,
      html: WAITLIST_EMAIL_BODY,
    });
  }

  private async _sendApprovedWaitlistEmail(data): Promise<void> {
    const { to } = data;
    await SendGrid.send({
      to: to,
      from: 'hello@cent.co',
      subject: 'Congratulations! You can now use Cent Pages',
      text: APPROVED_WAITLIST_EMAIL_TEXT,
      html: APPROVED_WAITLIST_EMAIL_BODY,
    });
  }

  private async _sendUserFeedbackEmail(data): Promise<void> {
    const {
      appProtocol,
      appHostname,
    } = this.envs;
    const {
      creatorName,
      subdomain,
      feedback,
      userEmail,
    } = data;

    const displayName = creatorName || `${subdomain}.cent.co`;

    const emailBody = feedbackEmailBody(feedback, displayName, subdomain, userEmail, appProtocol, appHostname);

    await SendGrid.send({
      to: 'hello@cent.co',
      from: 'feedback@cent.co',
      replyTo: userEmail,
      cc: 'kim@cent.co',
      subject: `Feedback from ${displayName}`,
      text: feedback,
      html: emailBody,
    });
  }

  private async _importEmails(data): Promise<void> {
    const {
      userID,
      emails,
      appID,
      isSendingNotification,
    } = data;

    const emailImportID = await database.createEmailImport(
      this.dbPool,
      appID,
      emails.length,
      isSendingNotification,
    );

    try {
      const appConfigs = await database.readAppConfigsByIDs(this.dbPool, [appID]);
      if (appConfigs.length < 1) {
        console.log('No app config found for appID', appID);
        return;
      }

      await database.createUsersFromImport(this.dbPool, emails);

      const allImportedUserIDs: string[] = (await database.readUsersByEmails(this.dbPool, emails)).map(u => u.id);

      const oldSubMap = {};
      const oldSubs = await database.readSubscriberIDsByUserIDsAndAppID(this.dbPool, allImportedUserIDs, appID);
      oldSubs.forEach(s => { oldSubMap[s.subscriber_id] = true; });

      const newSubUserIDs = [];
      allImportedUserIDs.forEach((id) => {
        if (!oldSubMap[id]) {
          newSubUserIDs.push(id);
        }
      });

      if (newSubUserIDs.length > 0) {
        await database.createBulkSubscription(this.dbPool, newSubUserIDs, appID, emailImportID);
      }
      await database.updateEmailImportTotalAndStatus(this.dbPool, emailImportID, newSubUserIDs.length, 'CONF');

      this.applySalesforce({
        userID,
        updates: {
          Date_of_Last_Email_Import__pc: new Date().toISOString(),
          Number_of_Emails_Last_Imported__pc: newSubUserIDs.length,
        }
      });

      if (isSendingNotification) {
        this.sendSubscriptionNotifications({
          offset: 0,
          emailImportID,
          subdomain: appConfigs[0].subdomain,
          appName: appConfigs[0].name,
          appID,
        });
      }
    }
    catch (e) {
      await database.updateEmailImportTotalAndStatus(this.dbPool, emailImportID, 0, 'FAIL');
    }
  }

  private async _mintToken(data): Promise<void> {
    const {
      nftContract,
      nftContractV2,
      collectionManagerContract,
      biconomyApiKey,
      managerGroupMemberSecret,
    } = this.envs;
    const {
      tokenID,
    } = data;

    // Get Token
    const tokens = await database.readTokenByIDs(this.dbPool, [tokenID]);
    if (tokens.length == 0) {
      throw new Error('Token not found');
    }
    const token = tokens[0];
    if (token.create_txid && token.create_txid.length > 0) {
      // Check `length` as sometimes Biconomy returns empty txids
      throw new Error('Already minted post');
    }

    // Get App
    const apps = await database.readAppConfigsByIDs(this.dbPool, [token.app_id]);
    if (apps.length == 0) {
      throw new Error('Unable to load app_config');
    }
    const app = apps[0];

    // Get Post
    const posts = await database.readPostsByIDs(this.dbPool, [token.source_id]);
    if (posts.length == 0) {
      throw new Error('Unable to load post');
    }
    const post = posts[0];

    // Get Users
    const users = await database.readUsersByIDs(this.dbPool, [token.recipient_id]);
    if (users.length == 0 || !users[0].wallet_address) {
      throw new Error('Unable to load collector');
    }
    const collector = users[0];

    // Get Collection
    let collection = null;
    if (post.collection_id) {
      const collections = await database.readCollectionsByIDs(this.dbPool, [post.collection_id]);
      if (collections.length == 0) {
        throw new Error('Unable to load collection');
      }
      collection = collections[0];
    }

    // Mint it!
    if (collection) {
      if (collection.version === 3) {
        const txnID = await blockchain.mintTokenAndCollectionSingleton(
          this.maticProvider,
          biconomyApiKey,
          collectionManagerContract,
          managerGroupMemberSecret,
          collection.contract_uri,
          collection.royalty_address,
          collection.royalty_rate,
          collection.token_name,
          collection.token_symbol,
          post.token_uri,
          post.token_supply_cap || 0,
          token.id,
          collector.wallet_address,
        );
        await database.updateTokenTxn(
          this.dbPool,
          collection.contract_address,
          token.id,
          txnID,
        );
      }
      else {
        const txnID = await blockchain.mintTokenAndFactorySingleton(
          this.maticProvider,
          biconomyApiKey,
          nftContractV2,
          managerGroupMemberSecret,
          collection.contract_uri,
          collection.creator_address,
          collection.royalty_address,
          collection.royalty_rate,
          collection.token_name,
          collection.token_symbol,
          collector.wallet_address,
          token.id,
          post.token_uri,
          post.token_signature,
        );
        await database.updateTokenTxn(
          this.dbPool,
          collection.contract_address,
          token.id,
          txnID,
        );
      }
    }
    else if (app.nft_factory_address) {
      // Legacy Mint
      const txnID = await blockchain.mintToken(
        this.maticProvider,
        biconomyApiKey,
        nftContract,
        managerGroupMemberSecret,
        token.app_id,
        collector.wallet_address,
        token.id,
        post.token_uri,
        post.token_signature,
        post.token_royalty,
      );
      // Set the `create_txid` on the token as well as the nft contract address
      await database.updateTokenTxn(
        this.dbPool,
        app.nft_factory_address,
        token.id,
        txnID,
      );

    }
    else {
      throw new Error('Unable to load nft factory (legacy mint)');
    }

  }

  private async _applySalesforce(data: APPLY_SALESFORCE_ARGS): Promise<void> {
    const { userID, updates } = data;
    console.log('User:', userID);
    console.log('Salesforce Updates:', updates);

    let existingRecord = null;

    try {
      existingRecord = await this.salesforce.getAccountRecord(userID);
    } catch (error) {
      this.salesforce.resetToken();
    }

    if (!existingRecord) existingRecord = await this.salesforce.getAccountRecord(userID);

    if (existingRecord) {
      await this.salesforce.updateAccountRecord(userID, updates);
    } else {
      const newRecord = {
        ...await database.getSalesforceData(this.dbPool, userID),
        ...updates,
      }
      await this.salesforce.createAccountRecord(newRecord);
    }
  }

  private async _applySalesforceByStripeId(data: APPLY_SALESFORCE_BY_STRIPE_ARGS): Promise<void> {
    const { stripeID, updates } = data;
    console.log('Stripe ID:', stripeID);
    console.log('Salesforce Updates:', updates);

    let existingRecord = null;

    try {
      existingRecord = await this.salesforce.getAccountRecordByStripeId(stripeID);
    } catch (error) {
      this.salesforce.resetToken();
    }

    if (!existingRecord) existingRecord = await this.salesforce.getAccountRecordByStripeId(stripeID);

    if (existingRecord) {
      await this.salesforce.updateAccountRecordByStripeId(stripeID, updates);
    } else {
      console.log(`Salesforce Record associated with the Stripe Id doesn't exist`);
    }
  }

  private async _applyMultiSalesforce(data: APPLY_MULTI_SALESFORCE_ARGS): Promise<void> {
    const { infos } = data;

    console.log('Number of updates:', infos.length);

    try {
      await Promise.all(infos.map(this._applySalesforce.bind(this)));
    } catch (error) {
      console.log('Applying multiple salesforce record failed', error);
    }
  }

  private async _createInboxNotifications(data: CREATE_INBOX_NOTIFICATIONS_ARGS): Promise<void> {
    try {
      const {
        offsetId,
        postId,
        creatorName,
        pageURL,
        postTitle,
        postImage,
        appId,
        sentAsSingle,
        notificationSent,
        ...restData
      } = data;

      if (postId && postTitle && appId) {
        const subscriptions = await database.readSubscriptionsActiveByAppIDPaginatedByID(
          this.dbPool,
          appId,
          offsetId,
          this.appNotifyDbLimit,
        );

        if (subscriptions.length > 0) {
          const writeRequests: DynamoDB.WriteRequest[] = subscriptions.map(s => {
            const isSent = s.daily_digest_subscribe ? notificationSent : true;
            const item = {
              user_id: s.subscriber_id.toString(),
              user_email_address: s.email_address,
              create_date: new Date().toISOString(),
              notification_id: uuidv4(),
              post_id: postId,
              creator_name: creatorName,
              page_url: pageURL,
              post_title: postTitle,
              post_image: postImage,
              app_id: appId,
              notification_status: NOTIFICATION_STATUS.UNREAD,
              sent_as_single: sentAsSingle,
              notification_sent: isSent,
              ...restData,
            };

            return {
              PutRequest: {
                Item: DynamoDB.Converter.marshall(item),
              }
            };
          });

          const batchWriteInput: DynamoDB.BatchWriteItemInput = {
            RequestItems: {
              [this.envs.notificationTable]: writeRequests
            }
          };
          const nextOffsetId = subscriptions[subscriptions.length - 1].id;

          await this.awsDynamoDBClient.batchWriteItem(batchWriteInput).promise();
          this.createInboxNotifications({
            offsetId: nextOffsetId,
            postId,
            creatorName,
            pageURL,
            postTitle,
            postImage,
            appId,
            sentAsSingle,
            notificationSent,
          });
        }
        console.log('Put inbox notification : Success');
      } else {
        console.log('Failed to put inbox notification: Invalid payload! Information is not valid for post notification');
      }
    } catch (err) {
      console.log('Failed to put inbox notification: Unexpectedly');
      console.log('StackTrace : ', err);
    }
  }
}

export default QueueProvider;
