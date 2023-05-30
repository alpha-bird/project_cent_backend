import ConfigController from '../../controllers/Api/Config';
import { isAppUser } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const tokenRoutes: AIB.Route[] = [
  {
    path: '/_/config',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: ConfigController.getConfigs,
  }
];

export default tokenRoutes;
