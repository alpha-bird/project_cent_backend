import PaymentController from '../../controllers/Api/Payment';
import { isAppUser, restrictAccess, isUserBanned } from '../../middlewares/Auth';
import { limitRegion } from '../../middlewares/Geo';
import { API_METHOD } from '../../interface/app';

const paymentRoutes: AIB.Route[] = [
  {
    path: '/_/payment',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: PaymentController.getPaymentAccount,
  },
  {
    path: '/_/payment/login',
    method: API_METHOD.GET,
    middlewares: [isAppUser, limitRegion],
    handler: PaymentController.getPaymentAccountLogin,
  },
  {
    path: '/_/payment/app-balance/:appID',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: PaymentController.getStripeBalanceByUser,
  },
  {
    path: '/_/payment/setup',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned, limitRegion],
    handler: PaymentController.setupPaymentAccount,
  },
  {
    path: '/_/purchase',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: PaymentController.getPurchases,
  },
  {
    path: '/_/purchase/app-total/:appID',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: PaymentController.getPurchaseTotalsByApp,
  },
  {
    path: '/_/purchase/app/:appID',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: PaymentController.getPurchasesByApp,
  },
  {
    path: '/_/purchase/:purchaseId',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: PaymentController.getPurchase,
  },
  {
    path: '/_/purchase/cancel',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, limitRegion],
    handler: PaymentController.cancelPurchase,
  },
  {
    path: '/_/purchase',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned, limitRegion],
    handler: PaymentController.createPurchase,
  },
];

export default paymentRoutes;
