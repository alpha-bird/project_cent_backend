import { Application } from 'express';
import { ethers } from 'ethers';
import schedule from 'node-schedule';
import mysql from 'mysql2/promise';

import type Stripe from 'stripe';
import type QueueProvider from '../helpers/queue';

import {
  getFactory,
  getFactoryAddresses,
  getCollectionAddresses,
  getExistsV2,
  getExistsV3,
} from '../helpers/blockchain';
import {
  readTokensUnminted,
  updateTokensMintStatus,
  readCollectionsMissingContractAddress,
  updateCollectionFactoryAddress,
  readProcessingAppConfigs,
  updateAppConfigFactoryAddress,
  updatePurchaseStatus,
  getNumberOfSubscribers,
  getPurchasesIncompletedOlder,
  getPurchaseAggregatesByApp,
  readAllAppConfigs,
} from '../helpers/database';
import { PURCHASE_STATUS } from '../interface/aib';

class Crons {
  public static bootBlockchainFactoryCron (pool: mysql.Pool, maticProvider: ethers.providers.JsonRpcProvider, nftContract: string): schedule.Job {
    const scheduledJob = schedule.scheduleJob('*/30 * * * * *', async function() {
      const appConfigs = await readProcessingAppConfigs(pool);

      console.log('Cron Job: Processing AppConfigs started!');
      console.log('appConfigs: ', appConfigs);

      await Promise.all(appConfigs.map(async (appConfig) => {
        try {
          const creatorFactoryAddress = await getFactory(maticProvider, nftContract, appConfig.id);
          console.log('AppId', appConfig.id, 'Factory address:', creatorFactoryAddress);

          await updateAppConfigFactoryAddress(pool, appConfig.id, creatorFactoryAddress);
        } catch (e) {
          // Log ones not found
          console.log('AppId', appConfig.id, e.message);
        }
      }));

      console.log('Cron Job: Processing AppConfigs finished!');
    });

    if (scheduledJob) {
      console.log('Setup BlockchainFactory Cron: Done!');
    }

    return scheduledJob;
  }

  public static bootCollectionCron (
    pool: mysql.Pool,
    maticProvider: ethers.providers.JsonRpcProvider,
    nftContractV2: string,
    collectionManagerContract: string,
  ): schedule.Job {
    const scheduledJob = schedule.scheduleJob('*/30 * * * * *', async function() {
      console.log('Cron Job: Processing Collections started!');

      const collections = await readCollectionsMissingContractAddress(pool);
      const v2 = collections.filter(c => c.version === 2);
      const v3 = collections.filter(c => c.version === 3);
      if (v2.length > 0) {
        const nftFactoryAddresses = await getFactoryAddresses(
          maticProvider,
          nftContractV2,
          v2.map(c => c.contract_uri),
        );

        await Promise.all(v2.map(async (c, i) => {
          if (nftFactoryAddresses[i] != '0x0000000000000000000000000000000000000000') {
            await updateCollectionFactoryAddress(pool, c.contract_uri, nftFactoryAddresses[i]);
          }
        }));
      }
      if (v3.length > 0) {
        const collectionAddresses = await getCollectionAddresses(
          maticProvider,
          collectionManagerContract,
          v3.map(c => c.contract_uri),
        );

        await Promise.all(v3.map(async (c, i) => {
          if (collectionAddresses[i] != '0x0000000000000000000000000000000000000000') {
            await updateCollectionFactoryAddress(pool, c.contract_uri, collectionAddresses[i]);
          }
        }));
      }

      const tokens = await readTokensUnminted(pool);
      if (tokens.length > 0) {
        const legacy = tokens.filter(t => !t.version);
        const minted = [];
        const unminted = [];
        const v2Tokens = tokens.filter(t => t.version == 2);
        const v3Tokens = tokens.filter(t => t.version == 3);
        if (v2Tokens.length > 0) {
          const exists = await getExistsV2(
            maticProvider,
            nftContractV2,
            v2Tokens.map(t => t.contract_uri),
            v2Tokens.map(t => t.id),
          );
          v2Tokens.forEach((t, i) => {
            if (exists[i]) {
              minted.push(t);
            }
            else {
              unminted.push(t);
            }
          });
        }
        if (v3Tokens.length > 0) {
          const v3TokensToCheck = v3Tokens.filter(t => {
            if (t.contract_address) {
              return true;
            }
            else {
              unminted.push(t);
              return false;
            }
          });
          if (v3TokensToCheck.length > 0) {
            const exists = await getExistsV3(
              maticProvider,
              collectionManagerContract,
              v3TokensToCheck.map(t => t.contract_uri),
              v3TokensToCheck.map(t => t.id),
            );
            v3TokensToCheck.forEach((t, i) => {
              if (exists[i]) {
                minted.push(t);
              }
              else {
                unminted.push(t);
              }
            });
          }
        }
        if (legacy.length > 0) {
          await updateTokensMintStatus(pool, legacy.map(t => t.id), null);
        }
        if (unminted.length > 0) {
          await updateTokensMintStatus(pool, unminted.map(t => t.id), false);
        }
        if (minted.length > 0) {
          await updateTokensMintStatus(pool, minted.map(t => t.id), true);
        }
      }

      console.log('Cron Job: Processing Collections finished!');
    });

    if (scheduledJob) {
      console.log('Setup Collection Cron: Done!');
    }

    return scheduledJob;
  }

  public static bootPurchaseCron (pool: mysql.Pool, stripe: Stripe): schedule.Job {
    const scheduledJob = schedule.scheduleJob('*/30 * * * * *', async function() {
      const purchases = await getPurchasesIncompletedOlder(pool);

      console.log('Cron Job: Processing Purchases incompleted & older than 10 mins started!');
      console.log('Number of Purchases: ', purchases.length);

      await Promise.all(purchases.map(async (purchase) => {
        try {
          console.log('Cancelling Purchase ID:', purchase.id);

          await updatePurchaseStatus(pool, purchase.id, PURCHASE_STATUS.CANCELED);
          await stripe.paymentIntents.cancel(purchase.intent_id);
        } catch (e) {
          console.log('Failed Cancelling Purchase:', purchase.id, e.message);
        }
      }));

      console.log('Cron Job: Processing Purchases finished!');
    });

    if (scheduledJob) {
      console.log('Setup Purchase Cron: Done!');
    }

    return scheduledJob;
  }

  public static bootSalesforceUpdateCron (pool: mysql.Pool, queueProvider: QueueProvider): schedule.Job {
    // Update Salesforce Record at the start of every day in the UTC timezone.
    const rule: schedule.RecurrenceRule = new schedule.RecurrenceRule();
    rule.hour = 0;
    rule.tz = 'Etc/UTC';

    const scheduledJob = schedule.scheduleJob(rule, async function() {
      console.log('Started Updating Sales Info on Salesforce Record')
      const apps = await readAllAppConfigs(pool);

      const salesforceUpdates = await Promise.all(apps.map(async app => {
        const [results] = await getPurchaseAggregatesByApp(pool, app.appID);
        const totalSubscribers = await getNumberOfSubscribers(pool, app.appID);

        return {
          userID: app.creator_id,
          updates: {
            Total_Number_of_Subscribers__pc: totalSubscribers,
            Total_Sales__pc: results.total_proceeds / 100,
            Total_Units_Sold__pc: results.total_nfts,
          }
        };
      }));

      console.log('Number of updates', salesforceUpdates.length);

      queueProvider.applyMultiSalesforce({ infos: salesforceUpdates });
    });

    if (scheduledJob) {
      console.log('Setup Salesforce Update Cron: Done!');
    }

    return scheduledJob;
  }

  // Initialize your crons
  public static init (_express: Application): Application {
    const { envs, maticProvider, stripe, queueProvider, dbPool } = _express.locals;

    // TODO: Remove this Cron after V2 Contract Migration
    const bCollectionCron = this.bootCollectionCron(dbPool, maticProvider, envs.nftContractV2, envs.collectionManagerContract);
    const bFactoryCron = this.bootBlockchainFactoryCron(dbPool, maticProvider, envs.nftContract);
    const bPurchaseCron = this.bootPurchaseCron(dbPool, stripe);
    const bSalesforceUpdateCron = this.bootSalesforceUpdateCron(dbPool, queueProvider);

    _express.locals.crons = {
      bCollectionCron,
      bFactoryCron,
      bPurchaseCron,
      bSalesforceUpdateCron,
    };

    return _express;
  }
}

export default Crons;
