import { Application, Response, NextFunction } from 'express';

import HttpException from './HttpException';
import Log from '../middlewares/Log';

class Handler {
  /**
   * Register your error / exception monitoring
   * tools right here ie. before "next(err)"!
   */
   public static logErrors(err: HttpException, req: AIB.IRequest, res: Response, next: NextFunction): any {
    Log.error(err.stack);

    return next(err);
  }

  /**
   * Handles your api/web routes errors/exception
   */
  public static clientErrorHandler(err: HttpException, req: AIB.IRequest, res: Response, next: NextFunction): any {
    Log.error(err.stack);

    if (req.xhr) {
      return res.status(500).send({error: 'Something went wrong!'});
    } else {
      return next(err);
    }
  }

  /**
   * Show undermaintenance page incase of errors
   */
  public static errorHandler(err: HttpException, req: AIB.IRequest, res: Response, next: NextFunction): any {
    Log.error(err.stack);
  
    const envs: AIB.IEnvironment = req.locals.envs;
    const apiPrefix = envs.apiPrefix;

    if (req.originalUrl.includes(`/${apiPrefix}/`)) {
      const status = err.status || 500;
      const message = err.message || 'Something went wrong';
      
      return res.status(status).send({
        status,
        message,
      });
    }

    const state = {
      _route: 'error',
      _content: { error: err.stack, title: 'Under Maintenance' }
    };
    return res.render('html', { data: state });
  }

  /**
   * Handles all the not found routes
   */
   public static notFoundHandler(_express: Application): Application {
    _express.use('*', (req: AIB.IRequest, res) => {
      const envs: AIB.IEnvironment = req.locals.envs;
      const apiPrefix = envs.apiPrefix;
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

      Log.error(`Path '${req.originalUrl}' not found [IP: '${ip}']!`);

      if (req.xhr || req.originalUrl.includes(`/${apiPrefix}/`)) {
        return res.json({ error: 'Page Not Found' });
      } else {
        res.status(404);

        const state = {
          _route: 'notFound',
          _content: 'Page Not Found'
        };
        return res.render('html', { data: state });
      }
    });

    return _express;
  }
}

export default Handler;
