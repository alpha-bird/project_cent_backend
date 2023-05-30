import TokenController from '../../controllers/Api/Token';
import { isAppUser } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const tokenRoutes: AIB.Route[] = [
  {
    path: '/_/token',
    method: API_METHOD.GET,
    handler: TokenController.getTokens,
  },
  {
    path: '/_/token/user/limit',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: TokenController.getUserLimit,
  },
  {
    path: '/_/token/user',
    method: API_METHOD.GET,
    handler: TokenController.getUserTokens,
  },
  {
    path: '/_/token/apps',
    method: API_METHOD.GET,
    handler: TokenController.getCollectedApps,
  },
  {
    path: '/_/token/:tokenId/transfer',
    method: API_METHOD.POST,
    middlewares: [isAppUser],
    handler: TokenController.transferTokenRequest,
  },
  {
    path: '/_/token/:tokenId/transfer',
    method: API_METHOD.PUT,
    middlewares: [isAppUser],
    handler: TokenController.updateTransferTokenStatus,
  },
  {
    path: '/_/token-collectors',
    method: API_METHOD.GET,
    handler: TokenController.getTokenCollectors,
  },
];

export default tokenRoutes;
