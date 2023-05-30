import axios, { AxiosResponse } from 'axios';
import { Response } from 'express';
import FormData from 'form-data';
import sanitizeHtml from 'sanitize-html';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

import * as blockchain from '../../helpers/blockchain';
import * as database from '../../helpers/database';
import * as imgix from '../../helpers/imgix';
import { jsonResponse, htmlResponse } from '../../helpers/response';
import { ISalesforceAccount } from '../../helpers/salesforce';
import { postSlackMessage } from '../../helpers/slack';
import { postToHtml } from '../../utils/formatting';
import HttpException from '../../exception/HttpException';
import { APP_ENV } from '../../interface/app';
import { USER_STATUS } from '../../interface/aib';
import {
  transformPostForEmail,
} from '../../utils/email_utils';
import TokenController from './Token';

interface PinataResult {
  IpfsHash: string;
}

export const uploadJSONToIPFS = async (
  json: any,
  pinataKey: string,
  pinataSecret: string
): Promise<string> => {
  const response: AxiosResponse = await axios.post(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    json,
    {
      withCredentials: true,
      headers: {
        'pinata_api_key': pinataKey,
        'pinata_secret_api_key': pinataSecret,
      }
    }
  );
  const result: PinataResult = response.data;
  return `ipfs://${result.IpfsHash}`;
}

export const uploadFileToIPFS = async (
  data: any,
  filename: string,
  contentType: string,
  pinataKey: string,
  pinataSecret: string
): Promise<string> => {
  let result: PinataResult;
  let response: AxiosResponse;
  let retry = false;
  try {
    const form = new FormData() as any;
    form.append('file', data, { filename, contentType });
    response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      form,
      {
        withCredentials: true,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          'Content-type': `multipart/form-data; boundary= ${form._boundary}`,
          'pinata_api_key': pinataKey,
          'pinata_secret_api_key': pinataSecret,
        }
      }
    );
    result = response.data;
  }
  catch (e) {
    console.log('PINATA RETRY');
    retry = true;
  }
  if (retry) {
    const form = new FormData() as any;
    form.append('file', data, { filename, contentType });
    response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      form,
      {
        withCredentials: true,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          'Content-type': `multipart/form-data; boundary= ${form._boundary}`,
          'pinata_api_key': pinataKey,
          'pinata_secret_api_key': pinataSecret,
        }
      }
    );
    result = response.data;
  }
  return `https://ipfs.io/ipfs/${result.IpfsHash}`;
}

const extractMime = (url: string, contentType: string): { type: string; subType: string } => {
  // Try deriving the mime type from the extension.
  const ext = url
    .split('/').slice(-1)[0]  // Get last part of the path
    .split('.').slice(-1)[0]  // Get file extension
    .toLowerCase();           // Normalize casing

  if (ext === 'png' || ext === 'gif' || ext === 'jpg' || ext === 'jpeg') {
    return {
      type: 'image',
      subType: ext
    }
  } else if (ext === 'mp3' || ext === 'wav') {
    return {
      type: 'audio',
      subType: ext
    }
  } else if (ext === 'mp4' || ext === 'webm') {
    return {
      type: 'video',
      subType: ext
    }
  }

  // Try deriving the mime type from the response headers
  const mimeType = contentType
    .split(';')[0]  // Remove optional character set encoding
    .toLowerCase()  // Normalize casing
    .trim();        // Remove whitespace

  const [type, subType] = mimeType.split('/');
  return {
    type,
    subType
  }
}

export const replaceResourcesWithIPFS = async (
  pinataKey: string,
  pinataSecret: string,
  body: string,
  styledHTML: string,
  resources: { type: string, url: string }[]
): Promise<{
  newBody: string,
  newStyledHTML: string,
  newResources: { oldURL: string, newURL: string, type: string }[]
}> => {
  let newBody = body;
  let newStyledHTML = styledHTML;

  const newResources = await Promise.all(resources.map(async resource => {
    const resourceContent: AxiosResponse = await axios.get(resource.url, { responseType: 'arraybuffer' });
    const { type, subType } = extractMime(resource.url, resourceContent.headers['content-type'] || '');
    if (
      subType !== 'png'
      && subType !== 'gif'
      && subType !== 'jpg'
      && subType !== 'jpeg'
      && subType !== 'mp3'
      && subType !== 'wav'
      && subType !== 'mp4'
      && subType !== 'webm'
    ) {
      throw new Error('Unsupported media type');
    }

    const newURL = await uploadFileToIPFS(
      resourceContent.data,
      `${type}.${subType}`,
      `${type}/${subType}`,
      pinataKey,
      pinataSecret
    );

    newBody = newBody.replace(new RegExp(resource.url, 'g'), newURL);
    newStyledHTML = newStyledHTML.replace(new RegExp(resource.url, 'g'), newURL);

    return {
      type,
      oldURL: resource.url,
      newURL
    };
  }));

  return { newBody, newStyledHTML, newResources };
}

class PostController {
  public static async getPosts(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/post'
    const {
      appID,
      postIDs,
      active,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      if (active && appID) {
        const posts = await database.readActivePostByAppID(dbPool, appID as string);
        jsonResponse(res, null, posts);
      } else if (appID) {
        const posts = await database.readPostsByAppID(dbPool, appID as string);
        jsonResponse(res, null, posts);
      } else if (postIDs) {
        const posts = await database.readPostsByIDs(dbPool, postIDs as string[]);
        jsonResponse(res, null, posts);
      } else {
        throw new HttpException(404, 'Posts not found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getAppPosts(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/post/app'
    // THIS ENDPOINT ONLY RETURNS HIDDEN OR INACTIVE POSTS
    const {
      appID,
      // active,
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      if (appID) {
        const _offset = parseInt(offset as string) || 0;
        const _limit = parseInt(limit as string) || 20;
        // const _active = parseInt(active as string) || 0;
        const totalCount = await database.getNumberOfPostsInactiveOrHiddenByAppID(dbPool, appID as string);
        const posts = await database.readInactiveOrHiddenPostsByAppIDPaginated(dbPool, appID as string, _offset, _limit)
        jsonResponse(res, null, {
          posts,
          count: posts.length,
          totalCount,
          nextOffset: _offset + posts.length,
        });
      } else {
        throw new HttpException(404, 'Posts not found');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getGlobalPosts(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/post/global'
    const {
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;

    try {
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;
      const posts = await database.getPostsGloballyWithAppInfo(dbPool, _offset, _limit);
      jsonResponse(res, null, {
        posts,
        count: posts.length,
        nextOffset: _offset + posts.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }


  public static async createPost(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/post', isAppUser, isUserBanned
    const userID = req.sessionUser.id;
    const userWallet = req.sessionUser.wallet_address;
    const {
      sendNotification = true,
      appID,
      title,
      styledHTML,
      body,
      primaryColor,
      secondaryColor,
      claimFirstNFT,
      imageURI,
      contentURI,
      deactivatePosts = true,
      tokenURI,
      tokenSupplyCap,
      tokenPrice,
      contractURI,
    } = req.body;
    const { envs, dbPool, queueProvider, heap } = req.locals;
    const {
      appProtocol,
      appHostname,
      isSlackAppEnabled,
      slackNewPostUrl,
    } = envs;

    try {
      let tokenSupplyCapBounded = parseInt(tokenSupplyCap);
      if (isNaN(tokenSupplyCapBounded)) { // If no token supply cap specified, use defaults
        tokenSupplyCapBounded = tokenPrice ? database.UNLIMITED_TOKENS : database.MAX_TOKEN_CAP;
      } else if (tokenSupplyCapBounded < database.ZERO_TOKEN_CAP || tokenSupplyCapBounded > database.MAX_TOKEN_CAP) {
        throw new HttpException(400, 'Invalid Supply Cap');
      }

      if (tokenSupplyCapBounded === database.ZERO_TOKEN_CAP && claimFirstNFT) {
        throw new HttpException(400, 'Cannot collect first NFT when supply is zero.')
      }

      const appConfig = await database.readAppConfigsByIDs(dbPool, [appID]);
      if (appConfig.length < 1) throw new HttpException(404, 'Creator does not have an app to send from');
      else if (appConfig[0].creator_id != userID) throw new HttpException(401, 'Creator not authorized to use this app');

      if (!appConfig[0].can_send_email && sendNotification) throw new HttpException(401, 'Creator not authorized to send emails with this release');

      const collections = await database.readCollectionsByContractURI(dbPool, contractURI);
      if (collections.length < 1) throw new HttpException(404, 'Collection not found');
      else if (collections[0].app_id != appID) throw new HttpException(401, 'Not authorized to add to this collection');


      const parsedTokenPrice = parseInt(tokenPrice, 10) || null;
      if (parsedTokenPrice && parsedTokenPrice < 100) throw new HttpException(400, 'Token price must be at least $1');
      if (parsedTokenPrice && parsedTokenPrice > 99999999) throw new HttpException(400, 'Token price must be less than $999,999.99');

      const cleanBody = sanitizeHtml(body, {
        allowedTags: false,
        allowedAttributes: false
      });

      if (cleanBody.length > 0) {
        if (deactivatePosts) {
          const activePost = await database.readActivePostByAppID(dbPool, appID);
          if (activePost.length > 0) await database.deactivatePosts(dbPool, activePost.map(a => a.id));
        }

        const style = JSON.stringify({
          primaryColor,
          secondaryColor,
        });

        const newPostID = await database.createPost(
          dbPool,
          userID,
          appID,
          collections[0].id,
          title,
          body,
          style,
          styledHTML,
          imageURI,
          contentURI,
          tokenURI,
          tokenSupplyCapBounded,
          collections[0].royalty_rate,
          parsedTokenPrice,
          null,
        );

        if (sendNotification && appConfig[0].can_send_email) {
          const numSubs = await database.getNumberOfSubscribers(dbPool, appID);
          const emailCampaignID = await database.createEmailCampaign(
            dbPool,
            appID,
            newPostID,
            numSubs,
            new Date(),
          );
          const subdomain = appConfig[0].subdomain;
          const appName = appConfig[0].name;
          queueProvider.sendAppNotitifcations({
            offset: 0,
            emailCampaignID,
            primaryColor,
            secondaryColor,
            subdomain,
            appName,
            appID,
            postID: newPostID,
          });
        }

        const posts = await database.readPostsByIDs(dbPool, [newPostID]);

        // Mint first copy to creator's address
        if (claimFirstNFT) {
          const tokenID = await database.createFreeToken(
            dbPool,
            appID,
            newPostID,
            userID,
            userID,
            req.clientIp,
          );
          const tokens = await database.readTokenByIDs(dbPool, [tokenID]);
          if (tokens.length > 0) {
            queueProvider.mintToken({ tokenID });
          }
        }

        // Update active posts in app config
        const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID] as string[]);
        const appConfigStyle = JSON.parse(appConfigs[0].style);
        const updatedReleases = deactivatePosts ? [newPostID] : [newPostID].concat(appConfigStyle.active_releases || []);
        const updateStyle = JSON.stringify(Object.assign({}, appConfigStyle, {
          active_releases: updatedReleases
        }));
        await database.updateAppConfigStyle(dbPool, appID, updateStyle);

        const totalPosts = await database.readPostsByAppID(dbPool, appID);
        const updates: ISalesforceAccount = {
          Date_of_Last_Post__pc: posts[0].create_date,
          Total_Number_of_pages_Posts__pc: totalPosts.length,
        }
        if (totalPosts.length === 1) {
          updates.App_Status_ACTIVE__pc = posts[0].create_date;
        }

        queueProvider.applySalesforce({
          userID,
          updates,
        });

        heap.track('create-post', userID, {
          id: posts[0].id,
          app_subdomain: appConfig[0].subdomain,
          app_id: appID,
          price: tokenPrice,
        });
        if (isSlackAppEnabled) {
          const postLink = `${appProtocol}://${appConfig[0].subdomain}.${appHostname}/nft/${newPostID}`;
          postSlackMessage(slackNewPostUrl, `New cent post created by ${appConfig[0].subdomain}: <${postLink}|${title}>`);
        }

        if (envs.notificationEnabled) {
          queueProvider.createInboxNotifications({
            offsetId: 0,
            postId: newPostID,
            creatorName: appConfigs[0].name,
            pageURL: `https://${appConfig[0].subdomain}.cent.co/`,
            postTitle: title,
            postImage: imageURI ? imageURI.replace('ipfs.io', 'cent-media.mypinata.cloud') : imageURI,
            appId: appID,
            sentAsSingle: sendNotification,
            notificationSent: !appConfig[0].can_send_email || false,
          });
        }

        jsonResponse(res, null, posts);
      } else {
        jsonResponse(res, null, { message: 'HTML is invalid!', success: false});
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async getPostCollectors(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/post/:id/collectors'
    const userID = req.sessionUser.id;
    const { id } = req.params;
    const {
      offset,
      limit,
    } = req.query;
    const { dbPool } = req.locals;
    try {
      const posts = await database.readPostsByIDs(dbPool, [id as string]);
      if (posts.length < 1) {
        throw new HttpException(404, 'Post not found');
      }
      if (posts[0].creator_id !== userID) {
        throw new HttpException(401, 'User does not have access to this information');
      }
      const _offset = parseInt(offset as string) || 0;
      const _limit = parseInt(limit as string) || 20;
      const totalCount = await database.getNumberOfPostCollectors(dbPool, id as string);
      const collectors = await database.readCollectorsOfPostPaginated(dbPool, id as string, _offset, _limit);
      jsonResponse(res, null, {
        entries: collectors,
        totalCount,
        nextOffset: _offset + collectors.length,
      });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async exportPostCollectors(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/post/:id/collectors/export'
    const userID = req.sessionUser.id;
    const { id } = req.params;
    const { dbPool } = req.locals;
    try {
      const posts = await database.readPostsByIDs(dbPool, [id as string]);
      if (posts.length < 1) {
        throw new HttpException(404, 'Post not found');
      }
      if (posts[0].creator_id !== userID) {
        throw new HttpException(401, 'User does not have access to this information');
      }
      const collectors = await database.readCollectorsOfPostForExport(dbPool, id as string);
      const s = new Readable();
      s.pipe(res);
      const keys = Object.keys(collectors[0]);
      s.push(keys.join(','))
      collectors.forEach((result) => {
        s.push('\n' + keys.map(key => result[key]).join(','));
      });
      s.push(null);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }


  public static async getPost(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/post/:id'
    const { id } = req.params;
    const { dbPool, envs } = req.locals;

    try {
      const posts = await database.readPostsByIDs(dbPool, [id] as string[]);

      if (posts.length === 0) {
        htmlResponse(res, new HttpException(404, 'Post not found'), null);
      } else {
        let postHTML = posts[0].styled_html;
        if (postHTML) {
          postHTML = postHTML.replace(
            /src="[^"]*.(jpeg|png|jpg)"/i,      // regex captures the first image only
            match => {                          // match = `src="https://example.com/file.jpeg"`
              const parts = match.split('"');   // parts = [`src=`, `https://example.com/file.jpeg`, ``]

              parts[1] = imgix.replaceImgUrlWithImgix(envs.appEnv, envs.imgixKey, parts[1], 1024, null);

              return parts.join('"');
          });
        }
        htmlResponse(res, null, postToHtml(posts[0].title, postHTML));
      }
    } catch (e) {
      htmlResponse(res, e, null);
    }
  }

  public static async getPostDraft(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/post-draft/:uuid'
    const { uuid } = req.params;
    const { dbPool, envs } = req.locals;

    try {
      const drafts = await database.readPostDraft(dbPool, uuid);

      if (drafts.length === 0) {
        htmlResponse(res, new HttpException(404, 'Post not found'), null);
      } else {
        let postHTML = drafts[0].styled_html;
        if (postHTML) {
          postHTML = postHTML.replace(
            /src="[^"]*.(jpeg|png|jpg)"/i,      // regex captures the first image only
            match => {                          // match = `src="https://example.com/file.jpeg"`
              const parts = match.split('"');   // parts = [`src=`, `https://example.com/file.jpeg`, ``]

              parts[1] = imgix.replaceImgUrlWithImgix(envs.appEnv, envs.imgixKey, parts[1], 1024, null);

              return parts.join('"');
          });
        }
        htmlResponse(res, null, postToHtml(drafts[0].title, postHTML));
      }
    } catch (e) {
      htmlResponse(res, e, null);
    }
  }

  public static async deactivatePost(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/post/:id/deactivate', isAppUser
    const { id } = req.params;
    const userID = req.sessionUser.id;
    const { dbPool, heap } = req.locals;

    try {
      const posts = await database.readPostsByIDs(dbPool, [id]);

      if (posts.length === 0) {
        throw new HttpException(404, 'Post not found');
      } else {
        if (posts[0].id == id && posts[0].creator_id === userID) {
          await database.deactivatePosts(dbPool, [id]);

          // Update active posts in app config
          const appID = posts[0].app_id;
          const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID] as string[]);
          const appConfigStyle = JSON.parse(appConfigs[0].style);
          const updatedReleases = (appConfigStyle.active_releases || []).filter((id) => parseInt(id) !== posts[0].id);
          const style = JSON.stringify(Object.assign({}, appConfigStyle, {
            active_releases: updatedReleases
          }));
          await database.updateAppConfigStyle(dbPool, appID, style);

          heap.track('deactivate-post', userID, {
            id: posts[0].id,
            app_id: appID,
          });
          jsonResponse(res, null, { success: true });
        } else throw new HttpException(403, 'You are not the creator of this post');
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async showPost(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/post/:postID/show', isAppUser
    const userID = req.sessionUser.id;
    const postID = req.params.postID;
    const { dbPool, heap } = req.locals;

    try {
      // 1. Check the post to ensure it exists and is active.
      const posts = await database.readPostsByIDs(dbPool, [postID]);

      if (posts.length < 1) throw new HttpException(404, 'Post not found');
      if (posts[0].creator_id != userID) throw new HttpException(403, 'Current user is not recognized as the creator');

      await database.updatePostHidden(dbPool, postID, false);
      const updatedPost = await database.readPostsByIDs(dbPool, [postID]);
      heap.track('show-post', userID, {
        id: posts[0].id,
        app_id: posts[0].app_id,
      });
      jsonResponse(res, null, updatedPost);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async hidePost(req: AIB.IRequest, res: Response): Promise<void> {
    // @PUT '/_/post/:postID/hide', isAppUser
    const userID = req.sessionUser.id;
    const postID = req.params.postID;
    const { dbPool, heap } = req.locals;

    try {
      // 1. Check the post to ensure it exists and is active.
      const posts = await database.readPostsByIDs(dbPool, [postID]);

      if (posts.length < 1) throw new HttpException(404, 'Post not found');
      if (posts[0].creator_id != userID) throw new HttpException(403, 'Current user is not recognized as the creator');

      await database.updatePostHidden(dbPool, postID, true);
      await database.updatePostActive(dbPool, postID, false);
      const updatedPost = await database.readPostsByIDs(dbPool, [postID]);
      const appID = updatedPost[0].app_id;

      // Update active posts in app config
      const appConfigs = await database.readAppConfigsByIDs(dbPool, [appID] as string[]);
      const appConfigStyle = JSON.parse(appConfigs[0].style);
      const updatedReleases = (appConfigStyle.active_releases || []).filter((id) => parseInt(id) !== updatedPost[0].id);
      const style = JSON.stringify(Object.assign({}, appConfigStyle, {
        active_releases: updatedReleases
      }));
      await database.updateAppConfigStyle(dbPool, appID, style);

      heap.track('hide-post', userID, {
        id: posts[0].id,
        app_id: appID,
      });
      jsonResponse(res, null, updatedPost);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async testPost(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/post/test'
    const userID = req.sessionUser.id;
    const {
      body,
      title,
      primaryColor,
      secondaryColor,
      email,
      appID,
    } = req.body;

    const {
      dbPool,
      queueProvider,
      envs: {
        appProtocol,
        appHostname,
        appEnv,
      }
    } = req.locals;

    try {
      const appConfig = await database.readAppConfigsByIDs(dbPool, [appID]);

      if (appConfig.length < 1) throw new HttpException(404, 'Creator does not have an app to send from');
      else if (appConfig[0].creator_id != userID) throw new HttpException(401, 'Creator not authorized to use this app');
      else if (!appConfig[0].can_send_email) throw new HttpException(401, 'Creator not authorized to send emails');

      const cleanBody = sanitizeHtml(body, {
        allowedTags: false,
        allowedAttributes: false
      });

      if (cleanBody.length > 0) {
        const subdomain = appConfig[0].subdomain;
        const appName = appConfig[0].name;
        const emailBody = transformPostForEmail(
          body,
          title,
          subdomain,
          appName,
          appProtocol,
          appHostname,
          appEnv,
          0,
          primaryColor,
          secondaryColor,
        );

        const displayName = appName || `${subdomain}.cent.co`;
        queueProvider.sendEmail({
          from: `${subdomain}@mail.cent.co`,
          to: email,
          replyTo: `no-reply+${subdomain}@cent.co`,
          subject: `[Test] ${displayName}: ${title}`,
          text: `New NFT from ${displayName}`,
          html: emailBody,
        });

        jsonResponse(res, null, { success: true });
      } else {
        jsonResponse(res, null, { message: 'HTML is invalid!', success: false });
      }
    } catch (e) {
      jsonResponse(res, e, { success: false });
    }
  }

  public static async storePost(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/post/store', isAppUser, isUserBanned
    const userID = req.sessionUser.id;
    const userWallet = req.sessionUser.wallet_address;
    const {
      appID,
      body,
      title,
      styledHTML,
      resources,
      tokenRoyalty,
      ownerAddress,
    } = req.body;
    const {
      dbPool,
      envs: {
        appEnv,
        urlboxKey,
        pinataKey,
        pinataSecret,
      }
    } = req.locals;

    try {
      // 1. Check that the auth'd user has access to this app ID
      const appConfig = await database.readAppConfigsByIDs(dbPool, [appID]);
      if (appConfig.length < 1) throw new HttpException(404, 'Creator does not have an app to send from');
      else if (appConfig[0].creator_id != userID) throw new HttpException(401, 'Creator not authorized to use this app');
      const appProPic = appConfig[0].profile_image;
      const appName = appConfig[0].name;
      const appSubdomain = appConfig[0].subdomain;

      // 2. Check the tokenRoyalty
      const tokenRoyaltyNumber = parseInt(tokenRoyalty);
      if (tokenRoyaltyNumber >= database.MIN_ROYALTY && tokenRoyaltyNumber <= database.MAX_ROYALTY) {
        // The royalty is good. We use an empty `if` statement to beter handle `NaN` cases
      } else throw new HttpException(400, 'Invalid Royalty Specified');


      // 3. Upload all the media resources in the post to IPFS
      const { newStyledHTML, newResources } = await replaceResourcesWithIPFS(pinataKey, pinataSecret, body, styledHTML, resources);

      // 4. Set the thumbnail (`imageURI`) to use for the NFT
      let imageURI = null;
      const images = newResources.filter(r => r.type === 'image');
      if (images.length > 0) {
        // 4a. Use first image embedded in the post if present
        imageURI = images[0].newURL;
      }
      else if (appEnv == APP_ENV.DEV || appEnv == APP_ENV.PROD) {
        // 4b. Use screenshot of the post draft
        const uuid = uuidv4();
        await database.createPostDraft(dbPool, uuid, userID, appID, title, body, styledHTML);
        try {
          const baseURL = appEnv == APP_ENV.DEV ? 'service.cent.dev/api' : 'service.cent.co/api';
          const screenshot = await axios({
            method: 'GET',
            url: `https://api.urlbox.io/v1/${urlboxKey}/png`,
            responseType: 'stream',
            timeout: 15000,
            params: {
              url: `https://${baseURL}/_/post-draft/${uuid}`,
              selector: '.post-body',
              delay: 3000,
              fail_if_selector_missing: true
            }
          });

          imageURI = await uploadFileToIPFS(
            screenshot.data,
            `screenshot-${appSubdomain}.png`,
            'image/png',
            pinataKey,
            pinataSecret
          );
        }
        catch (e) {
          // 4c. Use Profile picture
          if (appProPic) {
            try {
              const resourceContent: AxiosResponse = await axios.get(appProPic, { responseType: 'arraybuffer' });
              const { type, subType } = extractMime(appProPic, resourceContent.headers['content-type'] || '');
              imageURI = await uploadFileToIPFS(
                resourceContent.data,
                `${type}.${subType}`,
                `${type}/${subType}`,
                pinataKey,
                pinataSecret
              );
            }
            catch (e) {
              // We give up
            }
          }

        }
        await database.deletePostDraft(dbPool, uuid);
      }

      if (imageURI === null) {
        // 4d. Use Image-Of-Last-Resort: Spinning Box
        imageURI = 'https://ipfs.io/ipfs/QmYsY6evAzD7Swf9j5pNtEFAgpsLvJLfgUGQcdWmvESXRE';
      }

      // 5. Upload the contractURI used by OpenSea
      const collectionImage = appProPic || 'https://cent.co/logo512.png';
      const royaltyReceiver = ownerAddress || (
        appEnv == APP_ENV.PROD
        ? '0x8F1e68d04dE4a58339a83b741639A835b7D0e98B'
        : '0x5378d6D766F345738b41ef2ceeFD91D803F55E82'
      );
      const contractURI = await uploadJSONToIPFS(
        {
          'name': title,
          'description': `A collection by ${appName || appSubdomain}`,
          'image': collectionImage,
          'external_link': `https://${appSubdomain}.cent.co`,
          'seller_fee_basis_points': tokenRoyaltyNumber,
          'fee_recipient': royaltyReceiver,
          'r': Math.random().toString(),
        },
        pinataKey,
        pinataSecret,
      );

      // 6. Create the collection
      await database.createCollection(
        dbPool,
        appID,
        contractURI,
        userWallet,
        royaltyReceiver,
        tokenRoyaltyNumber,
        title,
        appSubdomain,
        3,
      );

      // 7. Store the post as an html file on IPFS
      const contentURI = await uploadFileToIPFS(
        postToHtml(title, newStyledHTML),
        `post-${appSubdomain}.html`,
        'text/html',
        pinataKey,
        pinataSecret
      );

      // 8. Store the token metadata as a JSON on IPFS, referencing the html file just stored
      const tokenURI = await uploadJSONToIPFS(
        {
          name: title,
          image: imageURI,
          description: '',
          external_url: `https://${appSubdomain}.cent.co`,
          animation_url: contentURI
        },
        pinataKey,
        pinataSecret
      );

      jsonResponse(res, null, { contentURI, tokenURI, imageURI, contractURI });
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async claimPost(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/post/claim', isAppUser, isUserBanned
    const userID = req.sessionUser.id;
    const {
      postID
    } = req.body;
    const {
      heap,
      dbPool,
      queueProvider,
    } = req.locals;

    try {

      // 1. Check the post to ensure it exists and is active.
      const posts = await database.readPostsByIDs(dbPool, [postID]);
      if (posts.length == 0 || !posts[0].active || posts[0].token_price) {
        throw new HttpException(400, 'Post not able to be collected');
      }
      const activePost = posts[0];

      // 2. Check if app config is banned
      const appConfigs = await database.readAppConfigsByIDs(dbPool, [activePost.app_id]);
      if (appConfigs.length > 0
        && (appConfigs[0].status === USER_STATUS.BNND || appConfigs[0].status === USER_STATUS.RSRT)) throw new HttpException(400, 'Unable to collect this post');

      // 3. Check that the user is subscribed
      const existingSubscription = await database.readSubscriptionsByAppAndSubscriber(dbPool, userID, activePost.app_id);
      if (existingSubscription.length < 1) {
          throw new HttpException(400, 'Not subscribed');
      }

      // 3.5 Check if limit has been reached
      const collectedCount = await TokenController._getUserLimit(userID, dbPool);
      if (collectedCount >= 5) {
        throw new HttpException(400, 'You have used all of your free collects for the day.');
      }

      // 4. Create the token; throws if we can't
      const tokenID = await database.createFreeToken(
        dbPool,
        activePost.app_id,
        postID,
        userID,
        activePost.creator_id,
        req.clientIp,
      );

      // 5. Track that we created a token
      heap.track('collect-post', userID, {
        id: activePost.id,
        app_id: activePost.app_id,
        app_subdomain: appConfigs[0].subdomain,
        creator_id: activePost.creator_id
      });

      // 6. Fetch the token to return to the client
      const tokens = await database.readTokenByIDs(dbPool, [tokenID]);
      if (tokens.length == 0) throw new HttpException(400, 'Unable to create token');

      // 7. Kick off minting
      queueProvider.mintToken({ tokenID });

      jsonResponse(res, null, {
        tokens,
        collectedCount: collectedCount + 1,
        collectLimit: 5,
      });
    } catch (e) {
      console.log(e);
      jsonResponse(res, e, null);
    }
  }
}

export default PostController;
