import { Response, NextFunction } from 'express';
import multer from 'multer';

import ResourceController from '../../controllers/Api/Resource';
import { Uploader } from '../../helpers/uploader';
import { isAppUser, restrictAccess } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const resourceRoutes: AIB.Route[] = [
  {
    path: '/_/image/blob',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess],
    handler: ResourceController.uploadImageBlob,
  },
  {
    path: '/_/image/file',
    method: API_METHOD.POST,
    middlewares: [
      isAppUser,
      restrictAccess,
      multer({ storage: multer.memoryStorage() }).single('file')
      // (req: AIB.IRequest, res: Response, next: NextFunction): void =>
      //   Uploader.s3Uploader(req.locals.envs, req.locals.envs.resourceBucket).single('file')(req, res, next),
    ],
    handler: ResourceController.uploadLargeImageFile,
  },
  {
    path: '/_/audio/file',
    method: API_METHOD.POST,
    middlewares: [
      isAppUser,
      restrictAccess,
      multer({ storage: multer.memoryStorage() }).single('file')
      // (req: AIB.IRequest, res: Response, next: NextFunction): void =>
      //   Uploader.s3Uploader(req.locals.envs, req.locals.envs.resourceBucket).single('file')(req, res, next),
    ],
    handler: ResourceController.uploadLargeAudioFile,
  },
  {
    path: '/_/video/file',
    method: API_METHOD.POST,
    middlewares: [
      isAppUser,
      restrictAccess,
      multer({ storage: multer.memoryStorage() }).single('file')
      // (req: AIB.IRequest, res: Response, next: NextFunction): void =>
      //   Uploader.s3Uploader(req.locals.envs, req.locals.envs.resourceBucket).single('file')(req, res, next),
    ],
    handler: ResourceController.uploadLargeVideoFile,
  }
];

export default resourceRoutes;
