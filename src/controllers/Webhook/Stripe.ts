import { Response } from 'express';
import Stripe from 'stripe';
import mysql from 'mysql2/promise';

import { QueueProvider } from '../../helpers/queue';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import { Heap } from '../../helpers/heap';

import HttpException from '../../exception/HttpException';
import { PURCHASE_STATUS } from '../../interface/aib';

class StripeWebhookController {
  private static async verifyPurchaseAndMint(dbPool: mysql.Pool, queueProvider: QueueProvider, heap: Heap, purchaseIntentID: string): Promise<void> {
    const numTokensCreated = await database.createPurchasedTokens(dbPool, purchaseIntentID);

    if (numTokensCreated > 0) {
      const purchases = await database.getPurchaseByIntent(dbPool, purchaseIntentID);
      purchases.forEach((purchase) => {
        heap.track('purchase-post', purchase.recipient_id, {
          id: purchase.source_id,
          app_id: purchase.app_id,
          creator_id: purchase.creator_id,
          token_price: purchase.token_price,
          token_amount: purchase.nft_amount,
        });
      })
      const tokens = await database.readTokenByPurchaseIDs(dbPool, purchases.map(p => p.id));

      tokens.forEach(t => queueProvider.mintToken({ tokenID: t.id }));
    }
  }

  private static async updatePurchaseCustomer(stripe: Stripe, charge: Stripe.Charge): Promise<void> {
    const sellerAccountID = charge.destination as string;
    const transferID = charge.transfer as string;
    const description = charge.description;
    const customerEmail = charge.receipt_email;
    try {
      // Fetch the `transfer` to the seller's account.
      // This gets us a `payment` that we can update in the seller's dashboard.
      const transfer: Stripe.Transfer = await stripe.transfers.retrieve(transferID);
      const paymentID = transfer.destination_payment as string;

      // Create or retrieve the customer on the seller's account
      let customerID = null;
      const customers = await stripe.customers.list({ email: customerEmail, limit: 1 }, {
        stripeAccount: sellerAccountID
      });
      if (customers.data.length > 0) {
        customerID = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({ email: customerEmail }, {
          stripeAccount: sellerAccountID
        });
        customerID = customer.id;
      }

      // Update the payment on the seller's
      await stripe.charges.update(paymentID, { description, customer: customerID }, {
        stripeAccount: sellerAccountID
      });
    }
    catch (e) {
      console.log(`Error Updating Customer: ${e.message}`);
    }
  }

  public static async webHook(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/stripe'
    const { envs, stripe, dbPool, queueProvider, heap } = req.locals;
    const sig = req.headers['stripe-signature'];

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, envs.stripeWebhookSecret);
    } catch (err) {
      console.log(err);
      jsonResponse(res, new HttpException(400, 'Webhook Error'), null);
      return;
    }

    // Handle the event
    switch (event.type) {
      case 'account.updated': {
        const account: Stripe.Account = event.data.object as Stripe.Account;

        let status = 'Created';

        if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
          status = 'Enabled';
        }
        if (account.requirements.currently_due.length === 0 &&
          account.requirements.eventually_due.length === 0 &&
          account.future_requirements.currently_due.length === 0 &&
          account.future_requirements.eventually_due.length === 0) {
          status = 'Completed';
        }
        if (account.requirements.pending_verification.length > 0 || account.future_requirements.pending_verification.length > 0) {
          status = 'Pending';
        }
        if (account.requirements.disabled_reason || account.future_requirements.disabled_reason) {
          status = 'Restricted';
        }

        const user = await database.readUserByStripeID(dbPool, account.id);

        queueProvider.applySalesforce({
          userID: user.id,
          updates: {
            Payment_Country__pc: account.country,
            Payment_Currency__pc: account.default_currency,
            Payment_Email__pc: account.email,
            Payment_Signup_Date__pc: new Date(account.created).toISOString(),
            Payment_Account_Status__pc: status
          },
        });

        break;
      }
      case 'payment_intent.succeeded': {
        const paymentIntent: Stripe.PaymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('payment_intent.succeeded', paymentIntent.id);
        StripeWebhookController.updatePurchaseCustomer(stripe, paymentIntent.charges.data[0]);
        StripeWebhookController.verifyPurchaseAndMint(dbPool, queueProvider, heap, paymentIntent.id);
        break;
      }
      case 'payment_intent.processing': {
        const paymentIntent: Stripe.PaymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('payment_intent.processing', paymentIntent.id);
        database.updatePurchaseStatusWithIntentID(dbPool, paymentIntent.id, PURCHASE_STATUS.PENDING);
        break;
      }
      case 'payment_intent.canceled': {
        const paymentIntent: Stripe.PaymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('payment_intent.canceled', paymentIntent.id);
        database.updatePurchaseStatusWithIntentID(dbPool, paymentIntent.id, PURCHASE_STATUS.CANCELED);
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent: Stripe.PaymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('payment_intent.payment_failed or canceled', paymentIntent.id);
        database.updatePurchaseStatusWithIntentID(dbPool, paymentIntent.id, PURCHASE_STATUS.FAILED);
        break;
      }
      case 'payout.created': {
        const payout: Stripe.Payout = event.data.object as Stripe.Payout;
        const stripeID = event.account;

        if (stripeID) {
          const user = await database.readUserByStripeID(dbPool, stripeID);
          if (user) {
            await database.createPayout(
              dbPool,
              user.app_id,
              user.id,
              payout.id,
              payout.amount,
              payout.currency,
              payout.automatic,
              payout.status,
              new Date(payout.created).toISOString(),
              new Date(payout.arrival_date).toISOString()
            );
          }
        }

        break;
      }
      case 'payout.paid':
      case 'payout.canceled':
      case 'payout.failed': {
        const payout: Stripe.Payout = event.data.object as Stripe.Payout;
        await database.updatePayoutStatus(dbPool, payout.id, payout.status);
        break;
      }
      case 'payout.updated': {
        const payout: Stripe.Payout = event.data.object as Stripe.Payout;

        await database.updatePayout(
          dbPool,
          payout.id,
          payout.amount,
          payout.currency,
          payout.automatic,
          payout.status,
          new Date(payout.created).toISOString(),
          new Date(payout.arrival_date).toISOString()
        );

        break;
      }
      // ... handle other event types
      default:
        console.log(`${event.type} is not supported`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send();
  }
}

export default StripeWebhookController;
