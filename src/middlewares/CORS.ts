import cors from 'cors';
import { Application } from 'express';

import Log from './Log';
import { APP_ENV } from '../interface/app';

class CORS {
  public mount(_express: Application): Application {
    Log.info('Booting the \'CORS\' middleware...');

    const envs: AIB.IEnvironment = _express.locals.envs;
    const { isCORSEnabled, appEnv } = envs;

    if (isCORSEnabled) {
      let corsOptions = {
        credentials: true,
        origin: [
          'http://localhost:4000',
          'http://localhost:3000',
          /http:\/\/([a-z0-9-]+).sslip.io:3000$/,
          /http:\/\/([a-z0-9-]+).([a-z0-9-]+).sslip.io:3000$/,
        ],
        optionsSuccessStatus: 200,
      };
  
      if (appEnv === APP_ENV.DEV) {
        corsOptions = {
          credentials: true,
          origin: [
            'https://relay.cent.dev',
            'https://v1.cent.dev',
            /https:\/\/([a-z0-9]+).v1.cent.dev$/,
          ],
          optionsSuccessStatus: 200
        };
      } else if (appEnv === APP_ENV.PROD) {
        corsOptions = {
          credentials: true,
          origin: [
            'https://relay.cent.co',
            'https://cent.co',
            /https:\/\/([a-z0-9]+).cent.co$/,
          ],
          optionsSuccessStatus: 200
        };
      }

      _express.use(cors(corsOptions));
    } else {
      _express.use(cors());
    }

    return _express;
  }
}

export default new CORS;
