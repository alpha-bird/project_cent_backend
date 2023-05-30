import InviteController from '../../controllers/Api/Invite';
import { isAppUser, isAdmin, restrictAccess } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const inviteRoute: AIB.Route[] = [
  {
    path: '/_/invite',
    method: API_METHOD.GET,
    middlewares: [isAdmin, restrictAccess],
    handler: InviteController.getInvites,
  },
  {
    path: '/_/invite/code/:code',
    method: API_METHOD.GET,
    handler: InviteController.getInviteByCode,
  },
  {
    path: '/_/invite/user/',
    method: API_METHOD.GET,
    middlewares: [isAppUser, restrictAccess],
    handler: InviteController.getUserInvite,
  },
  {
    path: '/_/invite',
    method: API_METHOD.POST,
    middlewares: [isAdmin, restrictAccess],
    handler: InviteController.createInvite,
  },
  {
    path: '/_/invite/signup',
    middlewares: [isAppUser, restrictAccess],
    method: API_METHOD.GET,
    handler: InviteController.getInviteSignup,
  },
  {
    path: '/_/invite/signup/total',
    method: API_METHOD.GET,
    handler: InviteController.getInviteSignupTotal,
  },
  {
    path: '/_/invite/signup',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess],
    handler: InviteController.createInviteSignup,
  },
  {
    path: '/_/invite/signup/validate',
    method: API_METHOD.POST,
    handler: InviteController.validateInviteSignup,
  },
];

export default inviteRoute;
