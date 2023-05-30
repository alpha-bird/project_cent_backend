import PhoneVerificationController from '../../controllers/Api/PhoneVerification';
import { isAppUser } from '../../middlewares/Auth';
import { API_METHOD } from '../../interface/app';

const phoneVerificationRoutes: AIB.Route[] = [
  {
    path: '/_/phone_verification',
    method: API_METHOD.POST,
    middlewares: [isAppUser],
    handler: PhoneVerificationController.createPhoneVerification,
  },
  {
    path: '/_/phone_verification/:id/validate',
    method: API_METHOD.POST,
    middlewares: [isAppUser],
    handler: PhoneVerificationController.validatePhoneVerification,
  },
];

export default phoneVerificationRoutes;
