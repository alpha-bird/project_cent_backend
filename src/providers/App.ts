import kue from 'kue';
import path from 'path';
import dotenv from 'dotenv';

import Express from './Express';
import Locals from './Locals';
import Log from '../middlewares/Log';

class App {
  // Clear the console
  public clearConsole (): void {
    process.stdout.write('\x1B[2J\x1B[0f');
  }

  // Loads your dotenv file
  public loadConfiguration (): void {
    Log.info('Configuration :: Booting @ Master...');

    dotenv.config({ path: path.join(__dirname, '../../.env') });
  }

  // Loads your Server
  public loadServer (): void {
    Log.info('Server :: Booting @ Master...');

    Express.init();
  }

  // Loads the Worker Cluster
  public loadWorker (): void {
    Log.info('Worker :: Booting @ Master...');
  }

  // Loads the Queue Monitor
  public loadQueue (): void {
    const envs: AIB.IEnvironment = Locals.config();
    const isQueueMonitorEnabled = envs.queueMonitorEnabled;
    const queueMonitorPort = envs.queueMonitorHttpPort;

    if (isQueueMonitorEnabled) {
      kue.app.listen(queueMonitorPort);

      console.log('\x1b[33m%s\x1b[0m', `Queue Monitor :: Running @ 'http://localhost:${queueMonitorPort}'`);
    }
  }
}

export default new App;
