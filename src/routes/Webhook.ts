import { Router } from 'express';

import StripeWebhookRoutes from './webook/stripe';

import { routesMapping } from '../utils/routing';

const router = Router();

routesMapping(router, StripeWebhookRoutes);

export default router;
