import { Response, NextFunction } from 'express';
import geoip from 'geoip-country';

import { jsonResponse } from '../helpers/response';
import HttpException from '../exception/HttpException';

export const limitRegion = async (req: AIB.IRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const match = geoip.lookup(req.ip);
    const cc = match ? match.country : 'US';
    if (
      cc == 'KP' || // North Korea
      cc == 'CU' || // Cuba
      cc == 'IR' || // Iran
      cc == 'SY' || // Syria
      cc == 'VE' || // Venezuela
      cc == 'BY' || // Belarus
      cc == 'MM' || // Myanmar (Burma)
      cc == 'CI' || // Cote D'Ivoire (Ivory Coast)
      cc == 'CD' || // Democratic Republic of Congo
      cc == 'LR' || // Liberia
      cc == 'SD' || // Sudan
      cc == 'ZW' || // Zimbabwe
      cc == 'RS'    // Russia
    ) {
      throw new HttpException(403, 'IP Blocked');
    }
    next();
  } catch (e) {
    jsonResponse(res, e, null);
  }
}
