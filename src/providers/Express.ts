import cluster from 'cluster';
import express from 'express';
import * as Sentry from '@sentry/node';
import * as Tracing from "@sentry/tracing";

import Locals from './Locals';
import Database from './Database';
import Providers from './Providers';
import Crons from './Crons';
import Routes from './Routes';
import Bootstrap from '../middlewares/Kernel';
import ExceptionHandler from '../exception/Handler';
import { APP_ENV } from '../interface/app';

class Express {
  /**
   * Create the express object
   */
  public express: express.Application;

  /**
   * Initializes the express server
   */
  constructor () {
    this.express = express();

    this.mountDotEnv();
    this.mountDBPool();
    this.mountProviders();

    this.initSentry();

    if (cluster.isMaster) {
      this.bootCrons();
    }

    this.mountMiddlewares();
    this.mountRoutes();
  }

  private mountDotEnv (): void {
    this.express = Locals.init(this.express);
  }

  private mountDBPool (): void {
    this.express = Database.init(this.express);
  }

  private mountProviders (): void {
    this.express = Providers.init(this.express);
  }

  private bootCrons (): void {
    this.express = Crons.init(this.express);
  }

  /**
   * Mounts all the defined middlewares
   */
  private mountMiddlewares (): void {
    this.express = Bootstrap.init(this.express);
  }

  /**
   * Mounts all the defined routes
   */
  private mountRoutes (): void {
    this.express = Routes.mountWeb(this.express);
    this.express = Routes.mountApi(this.express);
    this.express = Routes.mountWebhook(this.express);
  }

  private initSentry (): void {
    const { express } = this;
    const envs: AIB.IEnvironment = this.express.locals.envs;

    if (envs.sentryEnabled) {
      Sentry.init({
        debug: envs.appEnv !== APP_ENV.PROD,
        environment: envs.appEnv,
        dsn: envs.sentryDSN,
        integrations: [
          // enable HTTP calls tracing
          new Sentry.Integrations.Http({ tracing: true }),
          // enable Express.js middleware tracing
          new Tracing.Integrations.Express({ app: express }),
        ],
        tracesSampleRate: 0.01,
      });

      // RequestHandler creates a separate execution context using domains, so that every
      // transaction/span/breadcrumb is attached to its own Hub instance
      this.express.use(Sentry.Handlers.requestHandler({
        serverName: false,
        user: ["email_address"],
        version: false,
      }));

      // TracingHandler creates a trace for every incoming request
      this.express.use(Sentry.Handlers.tracingHandler());
    }
  }

  /**
   * Starts the express server
   */
  public init () {
    const envs: AIB.IEnvironment = this.express.locals.envs;
    const port: string | number = envs.appPort;

    if (envs.sentryEnabled) {
      // Registering Exception / Error Handlers
      this.express.use(Sentry.Handlers.errorHandler());
    }

    this.express.use(ExceptionHandler.logErrors);
    this.express.use(ExceptionHandler.clientErrorHandler);
    this.express.use(ExceptionHandler.errorHandler);
    this.express = ExceptionHandler.notFoundHandler(this.express);

    // Start the server on the specified port
    this.express.listen(port, () => {
      // if (_error) {
      //  return console.log('Error: ', _error);
      // }

      return console.log('\x1b[33m%s\x1b[0m', `Server :: Running @ 'http://localhost:${port}'`);
    });
  }
}

/** Export the express module */
export default new Express();
