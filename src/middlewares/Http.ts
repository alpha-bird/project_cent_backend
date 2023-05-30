import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import connectRedis from 'connect-redis';
import { Application, Response, NextFunction } from 'express';
import flash from 'express-flash';
import session from 'express-session';
import compress from 'compression';
import redis from 'redis';
import { APP_ENV } from '../interface/app';
import Log from './Log';

class Http {
  public static mount(_express: Application): Application {
    Log.info('Booting the \'HTTP\' middleware...');

    const {
      awsSNS,
      awsDynamoDBClient,
      queueProvider,
      maticProvider,
      magicSDK,
      dbPool,
      crons,
      heap,
      stripe,
      salesforce
    } = _express.locals;
    const envs: AIB.IEnvironment = _express.locals.envs;
    const {
      redisHttpPort,
      redisHttpHost,
      redisPassword,

      maxUploadLimit,
      maxParameterLimit,
      jwtSecret,
      appEnv,
    } = envs;

    _express.use((req: AIB.IRequest, res: Response, next: NextFunction): void => {
      if (req.originalUrl.includes('/webhook')) {
        // Stripe webhook takes the raw body; skip parsing
        next();
      } else {
        // Enables the request body parser
        bodyParser.json({ limit: maxUploadLimit })(req, res, next);
      }
    });

    _express.use(bodyParser.urlencoded({
      limit: maxUploadLimit,
      parameterLimit: maxParameterLimit,
      extended: false
    }));

    _express.use(cookieParser());

    // Disable the x-powered-by header in response
    _express.disable('x-powered-by');

    // Enables the request flash messages
    _express.use(flash());

    const RedisStore = connectRedis(session);
    // Configure redis client
    const redisClient = redis.createClient(
      redisHttpPort,
      redisHttpHost,
      { password: redisPassword }
    );

    redisClient.on('error', function (err) {
      console.log('Could not establish a connection with redis. ' + err);
    });

    redisClient.on('connect', function () {
      console.log('Connected to redis successfully');
    });

    /**
     * Enables the session store
     *
     * Note: You can also add redis-store
     * into the options object.
     */
    const options = {
      secret: jwtSecret,
      store: new RedisStore({ client: redisClient }),
      cookie: {
        httpOnly: true,
        secure: appEnv === APP_ENV.LOCAL ? false : true,
        sameSite: appEnv === APP_ENV.LOCAL ? false : 'none' as const,
        maxAge: 1209600000 // two weeks (in ms)
      },
      // Don't save the session until we modify it
      saveUninitialized: false,
      resave: false,
    };
    _express.set('trust proxy', 1);
    _express.use(session(options));

    // Enables the "gzip" / "deflate" compression for response
    _express.use(compress());

    // Set Environment variables into req.locals.envs
    _express.use((req: AIB.IRequest, res: Response, next: NextFunction) => {
      req.locals = {
        envs,
        awsSNS,
        awsDynamoDBClient,
        queueProvider,
        maticProvider,
        magicSDK,
        dbPool,
        crons,
        heap,
        stripe,
        salesforce,
      };
      next();
    });

    // Create read-only clone of session.user
    _express.use((req: AIB.IRequest, res: Response, next: NextFunction) => {
      req.sessionUser = Object.assign({}, req.session.user || {});
      next();
    });

    return _express;
  }
}

export default Http;
