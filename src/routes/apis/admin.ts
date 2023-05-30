import AdminController from '../../controllers/Api/Admin';
import { isAdmin, restrictAccess } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const adminRoutes: AIB.Route[] = [
  {
    path: '/_/admin/query',
    method: API_METHOD.POST,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.runQuery,
  },
  {
    path: '/_/admin/ban',
    method: API_METHOD.POST,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.banUser,
  },
  {
    path: '/_/admin/nsfw/page',
    method: API_METHOD.POST,
    middlewares: [isAdmin],
    handler: AdminController.setPageAdult,
  },
  {
    path: '/_/admin/nsfw/pages',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.getAdultPages,
  },
  {
    path: '/_/admin/flag',
    method: API_METHOD.POST,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.flagUser,
  },
  {
    path: '/_/admin/query/export',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.exportQuery,
  },
  {
    path: '/_/admin/creatoranalytics',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.getCreatorAnalytics,
  },
  {
    path: '/_/admin/queue/retry',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.retryClaims,
  },
  {
    path: '/_/admin/queue/query',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.queryQueueServer,
  },
  {
    path: '/_/admin/queue/flush',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.flushQueue,
  },
  {
    path: '/_/admin/banned',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: AdminController.getBannedUsers,
  },
];

export default adminRoutes;
