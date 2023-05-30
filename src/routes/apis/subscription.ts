import SubscriptionController from '../../controllers/Api/Subscription';
import { isAppUser, restrictAccess, isUserBanned } from '../../middlewares/Auth';
import { Uploader } from '../../helpers/uploader';
import { API_METHOD } from '../../interface/app';

const subscriptionRoutes: AIB.Route[] = [
  {
    path: '/_/subscription',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: SubscriptionController.getSubscriptions,
  },
  {
    path: '/_/subscription',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned],
    handler: SubscriptionController.createSubscription,
  },
  {
    path: '/_/subscription/import/validate',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned, Uploader.generalUploader().single('file')],
    handler: SubscriptionController.validateSubscriptionImport,
  },
  {
    path: '/_/subscription/import',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned, Uploader.generalUploader().single('file')],
    handler: SubscriptionController.importSubscription,
  },
  {
    path: '/_/subscription/export',
    method: API_METHOD.GET,
    handler: SubscriptionController.exportSubscription,
  },
  {
    path: '/_/subscribers',
    method: API_METHOD.GET,
    handler: SubscriptionController.getSubscribers,
  },
  {
    path: '/_/subscription/unsubscribe',
    method: API_METHOD.PUT,
    middlewares: [isAppUser],
    handler: SubscriptionController.unsubscribe,
  },
  {
    path: '/_/subscription/unsubscribe/email',
    method: API_METHOD.PUT,
    handler: SubscriptionController.unsubscribeEmail
  },
  {
    path: '/_/subscription/digest/subscribe',
    method: API_METHOD.POST,
    middlewares: [isAppUser],
    handler: SubscriptionController.subscribeToDigest,
  },
  {
    path: '/_/subscription/digest/unsubscribe',
    method: API_METHOD.PUT,
    handler: SubscriptionController.unsubscribeFromDigest
  },
];

export default subscriptionRoutes;
