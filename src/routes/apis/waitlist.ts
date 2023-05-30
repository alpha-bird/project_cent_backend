import WaitlistController from '../../controllers/Api/Waitlist';
import { isAdmin, restrictAccess } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const waitlistRoute: AIB.Route[] = [
  {
    path: '/_/waitlist',
    method: API_METHOD.GET,
    handler: WaitlistController.getWaitlist,
  },
  {
    path: '/_/waitlist',
    method: API_METHOD.POST,
    handler: WaitlistController.createWaitlistEntry,
  },
  {
    path: '/_/waitlist/conf',
    method: API_METHOD.POST,
    middlewares: [isAdmin, restrictAccess],
    handler: WaitlistController.confirmWaitlistEntry,
  },
  {
    path: '/_/admin/waitlist',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: WaitlistController.getAdminWaitlist,
  },
];

export default waitlistRoute;
