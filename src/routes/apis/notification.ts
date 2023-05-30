import NotificationController from '../../controllers/Api/Notification';
import { isAppUser, isAdmin } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';


const tokenRoutes: AIB.Route[] = [
  {
    path: '/_/notifications',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: NotificationController.getNotifications,
  },
  {
    path: '/_/notifications/unread',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: NotificationController.getNotificationsUnreadCount,
  },
  {
    path: '/_/notifications/:id',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: NotificationController.getNotification,
  },
  {
    path: '/_/notifications/:id',
    method: API_METHOD.PUT,
    middlewares: [isAppUser],
    handler: NotificationController.updateNotification,
  },
  {
    path: '/_/notifications',
    method: API_METHOD.POST,
    middlewares: [isAdmin],
    handler: NotificationController.createNotification,
  },
];

export default tokenRoutes;
