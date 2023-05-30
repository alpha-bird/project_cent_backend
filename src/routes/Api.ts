import { Router } from 'express';

import AdminRoutes from './apis/admin';
import AnalyticsRoutes from './apis/analytics';
import ConfigRoutes from './apis/config';
import CollectButtonRoutes from './apis/collectButton';
import AppConfigRoutes from './apis/appConfig';
import LinkRoutes from './apis/link';
import PaymentRoutes from './apis/payment';
import PostRoutes from './apis/post';
import PhoneVerificationRoutes from './apis/phoneVerification';
import ResourceRoutes from './apis/resource';
import NotificationRoutes from './apis/notification';
import SubscriptionRoutes from './apis/subscription';
import TokenRoutes from './apis/token';
import UserRoutes from './apis/user';
import WaitlistRoutes from './apis/waitlist';
import InviteRoutes from './apis/invite';

import { routesMapping } from '../utils/routing';
import HomeController from '../controllers/Api/Home';

const router: Router = Router();

routesMapping(router, AdminRoutes);
routesMapping(router, AnalyticsRoutes);
routesMapping(router, ConfigRoutes);
routesMapping(router, CollectButtonRoutes);
routesMapping(router, AppConfigRoutes);
routesMapping(router, LinkRoutes);
routesMapping(router, PaymentRoutes);
routesMapping(router, PostRoutes);
routesMapping(router, PhoneVerificationRoutes);
routesMapping(router, ResourceRoutes);
routesMapping(router, NotificationRoutes);
routesMapping(router, SubscriptionRoutes);
routesMapping(router, TokenRoutes);
routesMapping(router, UserRoutes);
routesMapping(router, WaitlistRoutes);
routesMapping(router, InviteRoutes);

router.get('/', HomeController.index);

export default router;
