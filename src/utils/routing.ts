import { Router } from 'express';

export const routesMapping = (router: Router, routes: AIB.Route[]): void => {
  routes.map((route: AIB.Route) => {
    router[route.method](route.path, route.middlewares || [], route.handler);
  });
};
