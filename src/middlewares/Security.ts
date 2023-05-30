import { Application, Response, NextFunction } from 'express';
import lusca from 'lusca';

import Log from './Log';

class Security {
  public static mount(_express: Application): Application {
    Log.info('Booting the \'Security\' middleware...');

    const LEGACY_RESOURCE_BUCKET = 'https://aib-resources-prod.s3.us-west-2.amazonaws.com';

    const envs: AIB.IEnvironment = _express.locals.envs;
    const {
      apiPrefix,
      frontendHostname,
      resourceBucket,
      appRegion,
      appHostname,
    } = envs;

    // Check for CSRF token iff the original url
    // does not contains the api substring
    _express.use((req: AIB.IRequest, res: Response, next: NextFunction) => {
      if (req.originalUrl.includes(`/${apiPrefix}/`) || req.originalUrl.includes('/webhook')) {
        next();
      } else {
        lusca.csrf()(req, res, next);
      }
    });

    // Enables x-frame-options headers
    _express.use(lusca.xframe('SAMEORIGIN'));

    // Enables HTTP Strict Transport Security for the host domain
    _express.use(lusca.hsts({ preload: true, maxAge: 31536000 }));

    // Enables xss-protection headers
    _express.use(lusca.xssProtection(true));

    // CSP(Content Security Policy)
    _express.use(lusca.csp({
      policy: {
        'default-src': "'self' 'unsafe-inline'",
        "frame-ancestors": `'self' ${frontendHostname} www.${frontendHostname} *.${frontendHostname} ${appHostname} *.${appHostname}`,
        "frame-src": `soundcloud.com w.soundcloud.com www.soundcloud.com embed.music.apple.com open.spotify.com youtube.com www.youtube.com`,
        "img-src": `'self' *.imgix.net https://${resourceBucket}.s3.${appRegion}.amazonaws.com ${LEGACY_RESOURCE_BUCKET} https://cent-media.mypinata.cloud data:`,
        "media-src": `'self' https://${resourceBucket}.s3.${appRegion}.amazonaws.com ${LEGACY_RESOURCE_BUCKET} https://cent-media.mypinata.cloud`,
        "script-src": `'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com`,
        "style-src": `${frontendHostname} 'unsafe-inline' https:`
      },
    }));

    return _express;
  }
}

export default Security;
