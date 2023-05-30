import AnalyticsController from '../../controllers/Api/Analytics';
import { isAppUser } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const analyticsRoutes: AIB.Route[] = [
  {
    path: '/_/analytics/general',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: AnalyticsController.getPageAnalytics,
  },
  {
    path: '/_/analytics/collect',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: AnalyticsController.getPageCollectAnalytics,
  },
  {
    path: '/_/analytics/releases',
    method: API_METHOD.GET,
    middlewares: [isAppUser],
    handler: AnalyticsController.getTopReleases,
  },
];

export default analyticsRoutes;
