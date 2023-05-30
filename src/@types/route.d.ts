import { Handler } from 'express';

declare global {
  namespace AIB {
    enum API_METHOD {
      GET = 'get',
      POST = 'post',
      PUT = 'put',
      DELETE = 'delete'
    }

    interface Route {
      path: string;
      method: API_METHOD;
      middlewares?: Handler[];
      handler: Handler;
    }
  }
}
