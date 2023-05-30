import { Response } from 'express';
import { Stripe } from 'stripe';

import { USER_STATUS } from '../../interface/aib';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import { PURCHASE_STATUS } from '../../interface/aib';
import HttpException from '../../exception/HttpException';

class PaymentController {
  public static async getPaymentAccount(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/payment', isAppUser
    const user = req.sessionUser;
    const { stripe } = req.locals;

    try {
      if (!user.stripe_id) throw new HttpException(404, `You didn't setup your payment account yet`);

      const stripeAccountData: Stripe.Response<Stripe.Account> = await stripe.accounts.retrieve(user.stripe_id);

      jsonResponse(res, null, {
        stripeId: stripeAccountData.id,
        isActive: stripeAccountData.details_submitted &&
          stripeAccountData.payouts_enabled &&
          stripeAccountData.requirements.errors.length === 0 &&
          stripeAccountData.requirements.disabled_reason === null,
        requirements: stripeAccountData.requirements,
        futureRequirements: stripeAccountData.future_requirements,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async setupPaymentAccount(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/payment/setup', isAppUser, isUserBanned, limitRegion
    const user = req.sessionUser;
    const { dbPool, stripe, envs, queueProvider, salesforce } = req.locals;
    const { appProtocol, frontendHostname } = envs;

    try {
      let stripeAccountId = user.stripe_id;

      if (!stripeAccountId) {
        const account: Stripe.Response<Stripe.Account> = await stripe.accounts.create({
          type: 'express',
          email: user.email_address,
          settings: {
            payouts: {
              schedule: {
                delay_days: 14,
                interval: 'daily',
              }
            }
          }
        });

        stripeAccountId = account.id;
        await database.updateUserStripeID(dbPool, user.id, stripeAccountId);

        const userID = user.id;
        let existingRecord = null;

        try {
          existingRecord = await salesforce.getAccountRecord(userID);
        } catch (error) {
          salesforce.resetToken();
        }

        if (!existingRecord) existingRecord = await salesforce.getAccountRecord(userID);

        if (existingRecord) {
          await salesforce.updateAccountRecord(userID, { Stripe_ID__c: stripeAccountId });
        } else {
          const newRecord = await database.getSalesforceData(dbPool, userID);
          await salesforce.createAccountRecord(newRecord);
        }
      }

      const response: Stripe.Response<Stripe.AccountLink> = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${appProtocol}://${frontendHostname}/account/payment`,
        return_url: `${appProtocol}://${frontendHostname}/account/payment`,
        type: 'account_onboarding',
      });

      jsonResponse(res, null, {
        created: response.created,
        expiresAt: response.expires_at,
        url: response.url
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getPaymentAccountLogin(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/payment/login', isAppUser, limitRegion
    const user = req.sessionUser;
    const { stripe } = req.locals;

    try {
      const stripeAccountId = user.stripe_id;

      if (!stripeAccountId) {
        throw new HttpException(400, 'Stripe account not set up');
      }

      const response: Stripe.Response<Stripe.LoginLink> = await stripe.accounts.createLoginLink(stripeAccountId);

      jsonResponse(res, null, {
        created: response.created,
        url: response.url
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }


  public static async getStripeBalanceByUser(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/payment/app-balance/:appID', isAppUser
    const userID = req.sessionUser.id;
    const { appID } = req.params;
    const { dbPool, stripe } = req.locals;

    try {
      const stripeAccount = req.sessionUser.stripe_id;
      if (!stripeAccount) {
        throw new HttpException(400, 'Stripe account not set up');
      }
      const apps = await database.readAppConfigsByIDs(dbPool, [appID]);
      if (apps.length == 0) {
        throw new HttpException(400, 'Invalid app');
      } else if (apps[0].creator_id != userID) {
        throw new HttpException(401, 'Not authorized');
      }
      const balance: Stripe.Response<Stripe.Balance> = await stripe.balance.retrieve({
        stripeAccount
      });
      jsonResponse(res, null, balance);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getPurchaseTotalsByApp(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/purchase/app-total/:appID', isAppUser
    const userID = req.sessionUser.id;
    const { appID } = req.params;
    const { dbPool } = req.locals;

    try {
      const apps = await database.readAppConfigsByIDs(dbPool, [appID]);
      if (apps.length == 0) {
        throw new HttpException(400, 'Invalid app');
      } else if (apps[0].creator_id != userID) {
        throw new HttpException(401, 'Not authorized');
      }
      const [results] = await database.getPurchaseAggregatesByApp(dbPool, appID);
      jsonResponse(res, null, {
        totalNFTs: results.total_nfts,
        totalProceeds: results.total_proceeds,
        totalRecipients: results.total_recipients
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getPurchasesByApp(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/purchase/app/:appID', isAppUser
    const userID = req.sessionUser.id;
    const {
      offset,
      limit,
    } = req.query;
    const { appID } = req.params;
    const { dbPool } = req.locals;

    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;

      const apps = await database.readAppConfigsByIDs(dbPool, [appID]);
      if (apps.length == 0) {
        throw new HttpException(400, 'Invalid app');
      } else if (apps[0].creator_id != userID) {
        throw new HttpException(401, 'Not authorized');
      }
      const totalCount = await database.getNumberOfPurchasesByApp(dbPool, appID);
      const purchases = await database.getPurchaseByAppPaginated(dbPool, appID, _offset, _limit);
      jsonResponse(res, null, {
        entries: purchases,
        totalCount,
        count: purchases.length,
        nextOffset: _offset + purchases.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getPurchases(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/purchase', isAppUser
    const user = req.sessionUser;
    const {
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;

      const totalCount = await database.getNumberOfPurchasesByUser(dbPool, user.id);
      const purchases = await database.getUserPurchases(dbPool, user.id, _offset, _limit);

      jsonResponse(res, null, {
        entries: purchases,
        totalCount,
        count: purchases.length,
        nextOffset: _offset + purchases.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getPurchase(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/purchase/:purchaseId', isAppUser
    const user = req.sessionUser;
    const { purchaseId } = req.params;
    const { dbPool } = req.locals;

    try {
      const purchase = await database.getPurchaseByID(dbPool, purchaseId);

      if (purchase.recipient_id !== user.id) throw new HttpException(401, 'Access Denied!');

      jsonResponse(res, null, purchase);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async createPurchase(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/purchase', isAppUser, isUserBanned, limitRegion
    const subscriber = req.sessionUser;
    const {
      postID,
      nftAmount,
    } = req.body;
    const { dbPool, stripe } = req.locals;

    try {
      const posts = await database.readPostsByIDs(dbPool, [postID]);
      if (posts.length < 1 || !posts[0].active) throw new HttpException(400, 'Post not able to be claimed');

      const activePost = posts[0];

      // Check if app config is banned
      const appConfigs = await database.readAppConfigsByIDs(dbPool, [activePost.app_id]);
      if (appConfigs.length > 0
        && (appConfigs[0].status === USER_STATUS.BNND || appConfigs[0].status === USER_STATUS.RSRT)) throw new HttpException(400, 'Unable to collect this post');

      const totalPrice: number = (nftAmount || 0) * (activePost.token_price || 0);
      // If the quantity is zero or the price is zero, bail
      if (totalPrice === 0) throw new HttpException(400, 'Nothing to purchase');

      const sellerFee = Math.ceil(totalPrice * 0.05); // seller fee: 5% of total price
      const buyerFee = Math.max(Math.ceil(totalPrice * 0.05), 50); // buyer fee: 5%, min: 50cent

      const purchaseId: string = await database.lockTokensAndCreatePurchase(
        dbPool,
        activePost.app_id,
        activePost.creator_id,
        subscriber.id,
        'POST',
        postID,
        activePost.title,
        nftAmount,
        activePost.token_price,
        totalPrice,
        buyerFee,
        sellerFee,
        activePost.token_supply_cap || Infinity,
        req.clientIp,
      );


      try {
        let customerID = subscriber.stripe_customer_id;
        let customer = null;
        // CE-1324
        // let paymentMethod = null;
        if (!customerID) {
          customer = await stripe.customers.create({ email: subscriber.email_address });
          await database.updateUserStripeCustomerID(dbPool, subscriber.id, customer.id);
          customerID = customer.id;
        } else {
          customer = await stripe.customers.retrieve(customerID);
          // CE-1324: Enable using saved payment methods once we understand the flow better.
          // paymentMethod = customer.invoice_settings.default_payment_method;
        }

        const creator = (await database.readUsersByIDs(dbPool, [activePost.creator_id])).shift();
        const paymentIntent = await stripe.paymentIntents.create({
          amount: totalPrice + buyerFee,
          currency: 'usd',
          customer: customerID,
          // CE-1324: Enable using saved payment methods once we understand the flow better.
          // setup_future_usage: paymentMethod ? undefined : 'off_session',
          // payment_method: paymentMethod ? paymentMethod : undefined,
          payment_method_types: ['card'],
          description: `NFT Purchase: ${nftAmount} x ${activePost.title}`,
          transfer_data: {
            amount: Math.floor(totalPrice * 0.95), // exclude seller fee: 5%
            destination: creator.stripe_id,
          },
          receipt_email: subscriber.email_address,
        });

        await database.updatePurchaseIntent(dbPool, purchaseId, paymentIntent.id);

        const purchase = await database.getPurchaseByID(dbPool, purchaseId);

        jsonResponse(res, null, { ...purchase, paymentIntent });
      }
      catch (e) {
        await database.updatePurchaseStatus(dbPool, purchaseId, PURCHASE_STATUS.FAILED);

        throw new Error('Unable to initiate purchase');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
  public static async cancelPurchase(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/purchase/cancel', isAppUser, limitRegion
    const {
      intentID,
    } = req.body;
    const { dbPool, stripe } = req.locals;
    try {
      const purchases = await database.getPurchaseByIntent(dbPool, intentID as string);
      if (purchases.length < 1) throw new HttpException(400, 'No purchases with this intent id found');
      const paymentIntent = await stripe.paymentIntents.cancel(intentID as string);
      jsonResponse(res, null, { paymentIntent });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default PaymentController;
