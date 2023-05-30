import { Response } from 'express';

import { jsonResponse } from '../../helpers/response';

class ConfigController {
  public static async getConfigs(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/config', isAppUser
    try {
      const { envs: {
        biconomyApiKey,
        nftContract,
        nftContractV2,
        collectionManagerContract,
      } } = req.locals;
    
      jsonResponse(res, null, { biconomyApiKey, nftContract, nftContractV2, collectionManagerContract });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }
}

export default ConfigController;
