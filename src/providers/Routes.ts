import { Application } from 'express';
import Log from '../middlewares/Log';

import webRouter from '../routes/Web';
import apiRouter from '../routes/Api';
import webhookRouter from '../routes/Webhook';

class Routes {
  public mountWeb(_express: Application): Application {
    Log.info('Routes :: Mounting Web Routes...');

    return _express.use('/', webRouter);
  }

  public mountApi(_express: Application): Application {
    const envs: AIB.IEnvironment = _express.locals.envs;
    const apiPrefix = envs.apiPrefix;
    Log.info('Routes :: Mounting API Routes...');

    return _express.use(`/${apiPrefix}`, apiRouter);
  }

  public mountWebhook(_express: Application): Application {
    Log.info('Routes :: Mounting Webhook Routes...');

    return _express.use('/webhook', webhookRouter);
  }
}

export default new Routes;
