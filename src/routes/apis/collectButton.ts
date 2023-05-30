import CollectButtonController from '../../controllers/Api/CollectButton';
import { API_METHOD } from '../../interface/app';

const collectButtonRoutes: AIB.Route[] = [
  {
    path: '/_/collect-button/status',
    method: API_METHOD.GET,
    handler: CollectButtonController.status,
  },
  {
    path: '/_/collect-button/login-and-nav',
    method: API_METHOD.GET,
    handler: CollectButtonController.loginAndNav,
  },
  {
    path: '/_/collect-button/collect',
    method: API_METHOD.POST,
    handler: CollectButtonController.collect,
  },
];

export default collectButtonRoutes;
