import ImgixClient from '@imgix/js-core';
import { APP_ENV } from '../interface/app';

let client = null;
const initClient = (
  appEnv: string,
  imgixKey: string
) => {
  if (!client) {
    client = new ImgixClient({
      domain: appEnv === APP_ENV.PROD ? 'aib.imgix.net' : 'aib-dev.imgix.net',
      secureURLToken: imgixKey,
    });
  }
  return client;
}

export const replaceImgUrlWithImgix = (
  appEnv: string,
  imgixKey: string,
  imgUrl: string,
  width: number | null,
  height: number | null
): string => {
  const client = initClient(appEnv, imgixKey);
  if (imgUrl.indexOf('.gif') > -1) {
    return client.buildURL(imgUrl, {});
  }
  return client.buildURL(imgUrl, {
    fit: 'clip',
    width,
    height
  });
}