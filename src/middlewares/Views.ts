import path from 'path';
import { Application } from 'express';
import EReactViews from 'express-react-views';

import Log from './Log';

class Views {
  public static mount(_express: Application): Application {
    Log.info('Booting the \'Views\' middleware...');

    _express.set('view engine', 'jsx');
    _express.set('views', path.join(__dirname, '../../views'));
    _express.engine('jsx', EReactViews.createEngine());

    _express.locals.pretty = true;

    return _express;
  }
}

export default Views;
