import express from 'express';

import StripeController from '../../controllers/Webhook/Stripe';
import { API_METHOD } from '../../interface/app';

const stripeRoutes: AIB.Route[] = [
  {
    path: '/stripe',
    method: API_METHOD.POST,
    middlewares: [express.raw({type: 'application/json'})],
    handler: StripeController.webHook,
  },
];

export default stripeRoutes;
