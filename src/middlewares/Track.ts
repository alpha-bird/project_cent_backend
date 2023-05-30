import { Application } from 'express';
import requestIp from 'request-ip';

import Log from './Log';

class Track {
  public mount(_express: Application): Application {
    Log.info('Booting the \'Track\' middleware...');

    // Install IP Middleware
    _express.use(requestIp.mw());

    return _express;
  }
}

export default new Track;
