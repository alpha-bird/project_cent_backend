import AWS from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';

import { APP_ENV } from '../interface/app';

const regExt = /(?:\.([^.]+))?$/;

export class Uploader {
  public static getS3Instance(envs: AIB.IEnvironment): AWS.S3 {
    if (envs.appEnv === APP_ENV.LOCAL) {
      return new AWS.S3({
        region: envs.appRegion,
        accessKeyId: envs.accessKeyId,
        secretAccessKey: envs.secretAccessKey,
      });
    }

    return new AWS.S3({ region: envs.appRegion });
  }

  public static s3Uploader(envs: AIB.IEnvironment, bucketName: string): multer.Multer {
    return multer({
      storage: multerS3({
        s3: this.getS3Instance(envs),
        bucket: function (req: Express.Request, file: Express.MulterS3.File, cb: (error: any, bucket?: string) => void) {
          cb(null, bucketName);
        },
        acl: 'public-read',
        metadata: function (req: Express.Request, file: Express.MulterS3.File, cb: (error: any, metadata?: any) => void) {
          cb(null, {fieldName: file.fieldname});
        },
        key: function (req: Express.Request, file: Express.MulterS3.File, cb: (error: any, key?: string) => void) {
          cb(null, `${uuidv4()}.${regExt.exec(file.originalname)[1]}`);
        }
      })
    });
  }

  public static generalUploader(): multer.Multer {
    return multer({});
  }
}

const sleep = (timeout: number) => new Promise(resolve => setTimeout(resolve, timeout));

export class LargeFileUploader {
  private static startUpload(s3Instance: AWS.S3, bucketName: string, originname: string): Promise<AWS.S3.CreateMultipartUploadOutput> {
    const params: AWS.S3.CreateMultipartUploadRequest = {
      Key: `${uuidv4()}.${regExt.exec(originname)[1]}`,
      Bucket: bucketName,
      ACL: 'public-read'
    };

    return s3Instance.createMultipartUpload(params).promise();
  }

  private static async uploadPart(s3Instance: AWS.S3, bucketName: string, buffer: Buffer, uploadId: string, key: string, partNumber: number): Promise<{
    status: string;
    reason: {
      PartNumber: number;
      ETag?: string;
      error?: any;
    }
  }> {
    const params: AWS.S3.UploadPartRequest = {
      Key: key,
      Bucket: bucketName,
      Body: buffer,
      PartNumber: partNumber, // Any number from one to 10.000
      UploadId: uploadId, // UploadId returned from the first method
    };

    return s3Instance.uploadPart(params).promise()
      .then(data => {
        return {
          status: 'fulfilled',
          reason: { PartNumber: partNumber, ETag: data.ETag }
        };
      })
      .catch(err => {
        console.log(err);
        return {
          status: 'rejected',
          reason: { PartNumber: partNumber, error: err }};
      });
  }

  private static async abortUpload(s3Instance: AWS.S3, uploadId: string, key: string, bucket: string): Promise<AWS.S3.AbortMultipartUploadOutput> {
    const params: AWS.S3.AbortMultipartUploadRequest = {
      Key: key,
      Bucket: bucket,
      UploadId: uploadId,
    };

    return new Promise((resolve, reject) => {
      s3Instance.abortMultipartUpload(params, (err, data) => {
        if (err) return reject(err);
        return resolve(data);
      });
    });
  }

  private static async completeUpload(s3Instance: AWS.S3, uploadId: string, parts, key: string, bucket: string): Promise<AWS.S3.CompleteMultipartUploadOutput> {
    const params: AWS.S3.CompleteMultipartUploadRequest = {
      Key: key,
      Bucket: bucket,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    };

    return new Promise((resolve, reject) => {
      s3Instance.completeMultipartUpload(params, (err, data) => {
        if (err) return reject(err);
        return resolve(data);
      });
    });
  }

  public static async upload(envs: AIB.IEnvironment, bucketName: string, file: Express.Multer.File): Promise<string> {
    const s3Instance = Uploader.getS3Instance(envs);

    const buffer = file.buffer;
    const chunkSize = Math.pow(1024, 2) * 10; // chunk size is set to 10MB
    const fileSize = file.size;
    const iterations = Math.ceil(fileSize / chunkSize); // number of chunks to be broken
    const arr = Array.from(Array(iterations).keys()); // dummy array to loop through

    let uploadId: string, key: string;

    try {
      // this will start the connection and return UploadId, Key
      const { UploadId, Key } = await this.startUpload(s3Instance, bucketName, file.originalname);
      uploadId = UploadId, key = Key;

      const parts = await Promise.all(arr.map(item =>
        this.uploadPart(s3Instance, bucketName, buffer.slice(item * chunkSize, (item + 1) * chunkSize), uploadId, key, item + 1))
      );

      const succeededParts = parts 
        .filter((part) => part.status === "fulfilled")
        .map((part) => part.reason);
      let failedParts = parts
        .filter((part) => part.status === "rejected")
        .map((part) => part.reason);

      let retry = 0;
      while(retry < 5 && failedParts.length > 0) { // Retry 5 times
        const retriedParts = await Promise.all(failedParts.map(({ PartNumber }) =>
          this.uploadPart(s3Instance, bucketName, buffer.slice((PartNumber - 1) * chunkSize, PartNumber * chunkSize), uploadId, key, PartNumber)));

        const _succeeded = retriedParts
          .filter((part) => part.status === "fulfilled")
          .map((part) => part.reason);
        const _failed = retriedParts
          .filter((part) => part.status === "rejected")
          .map((part) => part.reason);

        if (_succeeded.length > 0) {
          succeededParts.push(..._succeeded);
        }
        if (_failed.length > 0) {
          failedParts = _failed;
          console.log('Retry Multipart Upload: ', ++retry);
          console.log('Failed Part Numbers: ', _failed.map(f => f.PartNumber));
          await sleep(2000 * retry);
        }
      }

      const data = await this.completeUpload(
        s3Instance,
        uploadId,
        succeededParts.sort((a, b) => a.PartNumber - b.PartNumber), // needs sorted array
        key,
        bucketName
      );

      return data.Location;
    } catch(err) {
      console.error(err);

      await this.abortUpload(s3Instance, uploadId, key, bucketName);
      return null;
    }
  }
}
