import { Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  PhoneNumberUtil,
  PhoneNumberFormat as PNF
} from 'google-libphonenumber';


import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import { ACCESS_LEVEL, PHONE_VERIFICATION_STATUS, USER_STATUS } from '../../interface/aib';
import HttpException from '../../exception/HttpException';

class PhoneVerificationController {
  public static async createPhoneVerification(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/phone_verification', isAppUser

    const { envs, awsSNS, dbPool } = req.locals;
    const user = req.sessionUser;

    try {
      const { phone } = req.body;

      const code = String(Math.floor(Math.random()*90000) + 10000);
      const token: string = jwt.sign({ code }, envs.jwtSecret, {
        expiresIn: 10 * 60 // Expires in seconds
      });

      const recordId: string = await database.createPhoneVerificationRecord(dbPool, user.id, token);

      const phoneUtil: PhoneNumberUtil = PhoneNumberUtil.getInstance();
      const phoneNumber = phoneUtil.parse(phone, 'US');
      const formattedPhone = phoneUtil.format(phoneNumber, PNF.E164);

      // Send SMS to phone
      const params: AWS.SNS.PublishInput = {
        Message: 'Your verification code is ' + code, /* required */
        PhoneNumber: formattedPhone,
      };

      await awsSNS.publish(params).promise();

      jsonResponse(res, null, {
        id: recordId
      });
    } catch (e) {
      console.log(e);

      jsonResponse(res, e, null);
    }
  }

  public static async validatePhoneVerification(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/phone_verification/:id/validate', isAppUser

    const { envs, dbPool } = req.locals;
    const user = req.sessionUser;

    try {
      const phoneVerificationId = req.params.id;
      const { code } = req.body;

      const record = await database.getPhoneVerificationRecord(dbPool, phoneVerificationId);

      if (record && record.user_id === user.id) {
        const decodedCode: any = jwt.verify(record.token, envs.jwtSecret);

        if (code === decodedCode.code) {
          await database.updatePhoneVerificationRecord(dbPool, record.id, PHONE_VERIFICATION_STATUS.PASSED);

          if (user.app_id) {
            await database.updateAppConfigStatus(dbPool, user.app_id, USER_STATUS.DFLT);
          }
          await database.updateUserStatus(dbPool, user.id, USER_STATUS.DFLT);

          req.session.user = {
            ...req.session.user,
            access: ACCESS_LEVEL.NORMAL,
          };
          req.session.save(() => {
            console.log('Session updated');
          })

          jsonResponse(res, null, { success: true });
        } else {
          throw new HttpException(498, 'Code is incorrect!');
        }
      } else {
        throw new HttpException(422, 'Token validation failed!');
      }
    } catch (e) {
      console.log(e);

      if (e.message === 'jwt expired') {
        jsonResponse(res, new HttpException(401, 'Token is expired'), null);
      } else {
        jsonResponse(res, e, null);
      }
    }
  }
}

export default PhoneVerificationController;
