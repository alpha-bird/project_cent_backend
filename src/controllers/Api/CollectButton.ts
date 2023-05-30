import { Response } from 'express';

import { parse } from 'url';

import * as blockchain from '../../helpers/blockchain';
import * as database from '../../helpers/database';
import { jsonResponse } from '../../helpers/response';
import { USER_STATUS, ACCESS_LEVEL } from '../../interface/aib';
import HttpException from '../../exception/HttpException';
import { TRANSFER_STATUS, TRANSFER_STATUS_CODE } from '../../interface/aib';
import { assetToStyledHtml } from '../../utils/formatting';
import {
  COLLECT_BUTTON_COLLECTED_EMAIL_TEXT,
  collectButtonCollectedEmailBody,
} from '../../utils/email_utils';
import {
  uploadJSONToIPFS,
  replaceResourcesWithIPFS,
} from './Post';
import {
  createSubscriptionHelper,
} from './Subscription';

class CollectButtonController {

  // Take a user (if present) and token URL and return whether
  // it can still be collected
  public static async status(req: AIB.IRequest, res: Response): Promise<void> {
    // @GET '/_/collect-button/status'
    const origin = (req.query.origin as string) || '';
    const assetURL = (req.query.assetURL as string) || '';
    const DIDToken = (req.query.DIDToken || '') as string;

    const { dbPool, magicSDK } = req.locals;

    const result = {
      assetEligible: false,
      assetPost: null,
      userAuthenticated: false,
      userEligible: false,
      userCollected: 0,
    };

    try {
      let user = {} as any;
      if (req.sessionUser.id) {
        const users = await database.readUsersByIDs(dbPool, [req.sessionUser.id]);
        user = users[0];
      }
      else if (DIDToken) {
        const metadata = await magicSDK.users.getMetadataByToken(DIDToken);
        const email = metadata.email;
        const ethAddress = blockchain.validateAddress(metadata.publicAddress);

        const users = await database.readUsersByEmail(dbPool, email);
        if (users.length > 0) {
          user = users[0];
        }
      }
      result.userAuthenticated = !!user.id;

      const appOrigins = await database.readAppOrigins(dbPool, origin);
      if (appOrigins.length > 0) {
        // Allow the end user to tokenize any asset hosted on the domain.
        // In the future, make this a setting that the host can turn off.
        result.assetEligible = true;

        // In the future, allow the host to restrict who can tokenize (greenlist)
        result.userEligible = user.id && user.status !== USER_STATUS.RSRT;

        const posts = await database.readPostByAssetURL(dbPool, assetURL);
        if (posts.length > 0) {

          const post = posts[0];
          result.assetPost = post;

          if (user.id) {
            const userTokens = await database.readTokenByUserAndPostIDs(dbPool, user.id, [post.id]);
            result.userCollected = userTokens.length;
          }
        }
      }
      jsonResponse(res, null, result);
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

  public static async loginAndNav(req: AIB.IRequest, res: Response): Promise<void> {
    const {
      dbPool,
      magicSDK,
      heap,
      envs: {
        appProtocol,
        frontendHostname,
      }
    } = req.locals;
    const DIDToken = (req.query.DIDToken || '') as string;

    try {
      if (req.sessionUser.id) {
        res.redirect(`${appProtocol}://${frontendHostname}/account/collection`);
      }
      else if (DIDToken) {
        const metadata = await magicSDK.users.getMetadataByToken(DIDToken);
        const email = metadata.email;
        const ethAddress = blockchain.validateAddress(metadata.publicAddress);

        const users = await database.readUsersByEmail(dbPool, email);

        if (users.length === 0) {
          throw new Error('User not found');
        }
        if (users[0].status === USER_STATUS.PEND) {
          heap.track('create-user', users[0].id, {
            was_subscribed: true,
          });
          await database.confirmUser(dbPool, users[0].id, ethAddress);
        }

        req.session.user = {
          id: users[0].id,
          access: users[0].status === USER_STATUS.RSRT ? ACCESS_LEVEL.RESTRICTED : ACCESS_LEVEL.NORMAL,
        };
        res.redirect(`${appProtocol}://${frontendHostname}/account/collection`);
      }
      else {
        throw new Error('Invalid user data');
      }
    }
    catch (e) {
      res.redirect(frontendHostname);
    }
  }

  public static async collect(req: AIB.IRequest, res: Response): Promise<void> {
    // @POST '/_/collect-button/collect'
    const origin = (req.body.origin as string) || '';
    const assetTitle = (req.body.assetTitle as string) || '';
    const assetDescription = (req.body.assetDescription as string) || '';
    const assetThumbnail = (req.body.assetThumbnail as string) || '';
    const assetURL = (req.body.assetURL as string) || '';
    const DIDToken = (req.body.DIDToken || '') as string;
    const {
      dbPool,
      heap,
      queueProvider,
      magicSDK,
      envs: {
        appEnv,
        urlboxKey,
        pinataKey,
        pinataSecret,
      }
    } = req.locals;

    try {
      if (assetURL.indexOf(origin) === -1) {
        throw new HttpException(400, 'Asset URL must be hosted on origin');
      }
      const appOrigins = await database.readAppOrigins(dbPool, origin);
      if (appOrigins.length === 0) {
        throw new HttpException(400, 'Origin not configured');
      }
      const apps = await database.readAppConfigsByIDs(dbPool, [appOrigins[0].app_id]);
      if (apps.length === 0) {
        throw new HttpException(400, 'App not found');
      }
      const app = apps[0];

      let user = {} as any;
      if (req.sessionUser.id) {
        const users = await database.readUsersByIDs(dbPool, [req.sessionUser.id]);
        user = users[0];
      }
      else {
        const metadata = await magicSDK.users.getMetadataByToken(DIDToken);
        const email = metadata.email;
        const ethAddress = blockchain.validateAddress(metadata.publicAddress);

        const users = await database.readUsersByEmail(dbPool, email);

        if (users.length > 0) {
          if (users[0].status === USER_STATUS.PEND) {
            heap.track('create-user', users[0].id, {
              was_subscribed: true,
            });
            await database.confirmUser(dbPool, users[0].id, ethAddress);
          }
          user = users[0];
        }
      }
      if (!user.id || user.status === USER_STATUS.RSRT) {
        throw new Error('Collector account not found');
      }
      const collectorID = user.id;

      let posts = await database.readPostByAssetURL(dbPool, assetURL);
      if (posts.length === 0) {
        // 1. Create the collection details
        const collectionImage = app.profile_image || 'https://cent.co/logo512.png';
        const collectionRoyaltyNumber = 0;
        const collectionRoyaltyReceiver = '0x0000000000000000000000000000000000000000';
        const collectionTokenPrice = null;
        const collectionTokenName = 'NFTs';
        const collectionTokenSymbol = 'NFT';
        const collectionWallet = blockchain.getMetaWallet();
        const collectionCreatorAddress = await collectionWallet.getAddress();

        // 2. Upload the contractURI used by OpenSea
        const contractURI = await uploadJSONToIPFS(
          {
            'name': 'NFT Collection',
            'description': 'A collection of NFTs',
            'image': collectionImage,
            'external_link': 'https://cent.co',
            'seller_fee_basis_points': collectionRoyaltyNumber,
            'fee_recipient': collectionRoyaltyReceiver,
            'r': Math.random().toString(),
          },
          pinataKey,
          pinataSecret,
        );

        // 3. Create the collection
        const collectionID = await database.createCollection(
          dbPool,
          app.id,
          contractURI,
          collectionCreatorAddress,
          collectionRoyaltyReceiver,
          collectionRoyaltyNumber,
          collectionTokenName,
          collectionTokenSymbol,
          3,
        );

        // 4. Store the asset as an html file on IPFS
        const { newResources } = await replaceResourcesWithIPFS(pinataKey, pinataSecret, '', '', [{
          type: 'media',
          url: assetURL
        }, {
          type: 'image',
          url: assetThumbnail || assetURL
        }]);

        // 5. Store the token metadata as a JSON on IPFS, referencing the html file just stored
        const contentURI = newResources[0].newURL.replace('ipfs.io', 'cent-media.mypinata.cloud');
        const contentType = newResources[0].type;
        const imageURI = newResources[1].newURL.replace('ipfs.io', 'cent-media.mypinata.cloud');
        const tokenURI = await uploadJSONToIPFS(
          {
            name: assetTitle,
            description: assetDescription,
            image: imageURI,
            external_url: 'https://cent.co',
            animation_url: contentURI
          },
          pinataKey,
          pinataSecret
        );

        // 6. Create the HTML for the post
        const appConfigStyle = JSON.parse(app.style);
        const primaryColor = appConfigStyle.primary_color || '#000000';
        const secondaryColor = appConfigStyle.secondary_color || '#FFFFFF';
        const { body, styledHTML } = assetToStyledHtml(assetTitle, contentType, contentURI, primaryColor, secondaryColor);

        // 7. Create the post
        const newPostID = await database.createPost(
          dbPool,
          app.creator_id,
          app.id,
          collectionID,
          assetTitle,
          body,
          JSON.stringify({ primaryColor, secondaryColor }),
          styledHTML,
          imageURI,
          contentURI,
          tokenURI,
          database.MAX_TOKEN_CAP,
          collectionRoyaltyNumber,
          collectionTokenPrice,
          assetURL,
        );
        await database.updatePostHidden(dbPool, newPostID, true);
        posts = await database.readPostByAssetURL(dbPool, assetURL);
      }

      const post = posts[0];

      if (!post || !post.active || post.token_price) {
        throw new HttpException(400, 'Unable to collect');
      }

      const existingTokens = await database.readTokenByUserAndPostIDs(dbPool, collectorID, [post.id]);
      if (existingTokens.length > 0) {
        jsonResponse(res, null, existingTokens);
      }
      else {
        // This will fail if the supply is hit.
        const tokenID = await database.createFreeToken(
          dbPool,
          app.id,
          post.id,
          collectorID,
          collectorID,
          req.clientIp,
        );

        // Subscribe the collector to the app
        await createSubscriptionHelper(collectorID, app.id, true, dbPool, heap);

        const tokens = await database.readTokenByIDs(dbPool, [tokenID]);
        if (tokens.length > 0) {
          const hostedURI = (post.image_uri || '').replace('https://ifps.io', 'https://cent-media.mypinata.cloud');
          queueProvider.mintToken({ tokenID });
          queueProvider.sendEmail({
            from: `hello@mail.cent.co`,
            to: user.email_address,
            replyTo: `no-reply@cent.co`,
            subject: `Your new NFT is here. Congratulations! 🎉`,
            text: COLLECT_BUTTON_COLLECTED_EMAIL_TEXT,
            html: collectButtonCollectedEmailBody(hostedURI),
          });
        }
        jsonResponse(res, null, tokens);
      }
    } catch (e) {
      jsonResponse(res, e, null);
    }
  }

}

export default CollectButtonController;
