import { Application } from 'express';

import CORS from './CORS';
import Http from './Http';
import Views from './Views';
import Statics from './Statics';
import Security from './Security';
import StatusMonitor from './StatusMonitor';
import Track from './Track';

class Kernel {
  public static init (_express: Application): Application {
    // Mount CORS middleware
    _express = CORS.mount(_express);

    // Mount Track middleware
    _express = Track.mount(_express);

    // Mount basic express apis middleware
    _express = Http.mount(_express);

    // Mount security middleware
    _express = Security.mount(_express);

    // Mount view engine middleware
    _express = Views.mount(_express);

    // Mount statics middleware
    _express = Statics.mount(_express);

    // Mount status monitor middleware
    _express = StatusMonitor.mount(_express);

    return _express;
  }
}

export default Kernel;
