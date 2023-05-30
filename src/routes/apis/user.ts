import UserController from '../../controllers/Api/User';
import { isAppUser } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const userRoutes: AIB.Route[] = [
  {
    path: '/_/test/isDev',
    method: API_METHOD.GET,
    handler: UserController.getAppEnv,
  },
  {
    path: '/_/user/session',
    method: API_METHOD.GET,
    handler: UserController.getSession,
  },
  {
    path: '/_/user/logout',
    method: API_METHOD.GET,
    handler: UserController.logout,
  },
  {
    path: '/_/env',
    method: API_METHOD.GET,
    handler: UserController.getMagicKey,
  },
  {
    path: '/_/user',
    method: API_METHOD.GET,
    handler: UserController.getUser,
  },
  {
    path: '/_/user/display-name',
    method: API_METHOD.PUT,
    middlewares:  [isAppUser],
    handler: UserController.setDisplayName,
  },
  {
    path: '/_/user/accept-terms-conditions',
    method: API_METHOD.POST,
    middlewares:  [isAppUser],
    handler: UserController.acceptTermsAndConditions,
  },
  {
    path: '/_/user/loginWithMagic',
    method: API_METHOD.POST,
    handler: UserController.loginWithMagic,
  },
  {
    path: '/_/user/feedback',
    method: API_METHOD.POST,
    middlewares: [isAppUser],
    handler: UserController.sendUserFeedback,
  }
];

export default userRoutes;
