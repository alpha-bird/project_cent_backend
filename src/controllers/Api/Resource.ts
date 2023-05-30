import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Base64 from 'js-base64';

import { jsonResponse } from '../../helpers/response';
import { Uploader, LargeFileUploader } from '../../helpers/uploader';

class ResourceController {
  public static async uploadImageBlob(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/image/blob', isAppUser
    const { envs } = req.locals;

    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: envs.resourceBucket,
        Key: `${uuidv4()}.png`,
        ACL: 'public-read',
        ContentType: 'image/png',
        Body: Buffer.from(Base64.toUint8Array(req.body.blob.replace('data:image/png;base64,', ''))),
      };
    
      const data = await Uploader.getS3Instance(envs).upload(params).promise();
      jsonResponse(res, null, data.Location);
    } catch (err) {
      jsonResponse(res, err, null);
    }
  }

  public static async uploadImageFile(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/image/file', isAppUser,
    // (req: AIB.IRequest, res: Response, next: NextFunction): void => Uploader.s3Uploader(req.locals.envs, req.locals.envs.resourceBucket).single('file')(req, res, next),
    const file = req.file as Express.MulterS3.File;
    jsonResponse(res, null, file.location);
  }

  public static async uploadLargeImageFile(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/image/file', isAppUser,
    // multer({ storage: multer.memoryStorage() }).single('file')
    const { envs } = req.locals;
    const { resourceBucket } = envs;

    const link = await LargeFileUploader.upload(envs, resourceBucket, req.file);

    jsonResponse(res, null, link);
  }

  public static async uploadAudioFile(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/audio/file', isAppUser,
    // (req: AIB.IRequest, res: Response, next: NextFunction): void => Uploader.s3Uploader(req.locals.envs, req.locals.envs.resourceBucket).single('file')(req, res, next),
    const file = req.file as Express.MulterS3.File;
    jsonResponse(res, null, file.location);
  }

  public static async uploadLargeAudioFile(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/audio/file', isAppUser,
    // multer({ storage: multer.memoryStorage() }).single('file')
    const { envs } = req.locals;
    const { resourceBucket } = envs;

    const link = await LargeFileUploader.upload(envs, resourceBucket, req.file);

    jsonResponse(res, null, link);
  }

  public static async uploadVideoFile(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/video/file', isAppUser,
    // (req: AIB.IRequest, res: Response, next: NextFunction): void => Uploader.s3Uploader(req.locals.envs, req.locals.envs.resourceBucket).single('file')(req, res, next),
    const file = req.file as Express.MulterS3.File;
    jsonResponse(res, null, file.location);
  }

  public static async uploadLargeVideoFile(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/video/file', isAppUser,
    // multer({ storage: multer.memoryStorage() }).single('file')
    const { envs } = req.locals;
    const { resourceBucket } = envs;

    const link = await LargeFileUploader.upload(envs, resourceBucket, req.file);

    jsonResponse(res, null, link);
  }
}

export default ResourceController;
