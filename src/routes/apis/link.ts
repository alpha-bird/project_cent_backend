import LinkController from '../../controllers/Api/Link';
import { isAppUser, restrictAccess } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const linkRoutes: AIB.Route[] = [
  {
    path: '/_/link',
    method: API_METHOD.GET,
    handler: LinkController.getLinks,
  },
  {
    path: '/_/link',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess],
    handler: LinkController.createLink,
  },
  {
    path: '/_/link',
    method: API_METHOD.PUT,
    middlewares: [isAppUser, restrictAccess],
    handler: LinkController.updateLinks,
  },
];

export default linkRoutes;
