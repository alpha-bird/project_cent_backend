import AppConfigController from '../../controllers/Api/AppConfig';
import { isAppUser, isAdmin, restrictAccess, isUserBanned } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const appConfigRoutes: AIB.Route[] = [
  {
    path: '/_/appConfig',
    method: API_METHOD.GET,
    handler: AppConfigController.getAppConfig,
  },
  {
    path: '/_/appConfig/recently-collected',
    method: API_METHOD.GET,
    handler: AppConfigController.getRecentlyCollectedApps,
  },
  {
    path: '/_/appConfig',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned],
    handler: AppConfigController.createAppConfig,
  },
  {
    path: '/_/appConfig',
    method: API_METHOD.PUT,
    middlewares: [isAppUser, restrictAccess, isUserBanned],
    handler: AppConfigController.updateAppConfig,
  },
  {
    path: '/_/admin/appConfig/cansend',
    method: API_METHOD.PUT,
    middlewares: [isAdmin, restrictAccess],
    handler: AppConfigController.enableAppConfigCanSend,
  },
  {
    path: '/_/admin/appConfig',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AppConfigController.getAdminAppConfig,
  },
];

export default appConfigRoutes;
