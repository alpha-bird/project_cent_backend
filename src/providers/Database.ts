import { Application } from 'express';
import mysql from 'mysql2/promise';

import Log from '../middlewares/Log';

class Database {
  public static getDatabasePool (envs: AIB.IEnvironment): mysql.Pool {
    /*
      Create MySQL Database Pool
    */
    return mysql.createPool({
      host: envs.dbHost,
      port: envs.dbPort,
      user: envs.dbUser,
      password: envs.dbPassword,
      database: envs.dbName,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0 // No limit
    });
  }

  // Initialize your database
  public static init (_express: Application): Application {
    Log.info('Initialize the \'Database\' ...');

    const envs: AIB.IEnvironment = _express.locals.envs;
    _express.locals.dbPool = this.getDatabasePool(envs);

    return _express;
  }
}

export default Database;
