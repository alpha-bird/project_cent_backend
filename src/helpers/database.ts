import mysql from 'mysql2/promise';
import { TRANSFER_STATUS, PURCHASE_STATUS } from '../interface/aib';
import { ACCOUNT_TYPE, ISalesforceAccount } from '../helpers/salesforce';

function repeat(template, occurences) {
  return `,${template}`.repeat(occurences).slice(1);
}

export const MIN_ROYALTY = 2_50; // 2.5%
export const DEFAULT_ROYALTY = 10_00; // 7.5% + 2.5%
export const MAX_ROYALTY = 50_00; // 50%
export const MAX_TOKEN_CAP = 10_000;
export const ZERO_TOKEN_CAP = 0;
export const UNLIMITED_TOKENS = null;
export const UNLIMITED_TOKEN_BOUNDARY = 1_000_000_000;
export const INVITE_LIMIT = 20;
export const DAY_INTERVAL = 86400;
export const WEEK_INTERVAL = DAY_INTERVAL * 7;

export async function getSalesforceData(pool: mysql.Pool, userId: string): Promise<ISalesforceAccount> {
  const users = await readUsersByIDs(pool, [userId]);

  if (users.length === 0) throw new Error(`User doesn't exist`);

  const salesforceRecord: ISalesforceAccount = {
    Cent_ID__c: `${userId}`,
    Stripe_ID__c: users[0].stripe_id,
    PersonEmail: users[0].email_address,
    LastName: users[0].email_address,
    Create_Date_For_User__pc: users[0].create_date,
    Blockchain_Address__pc: users[0].wallet_address,
    Account_Type__c: ACCOUNT_TYPE.Subscriber,
  };

  const apps = await readAppConfigsByIDs(pool, [users[0].app_id]);
  if (apps.length > 0) {
    salesforceRecord.Account_Type__c = ACCOUNT_TYPE.Creator;
    salesforceRecord.App_ID__pc = apps[0].id;
    salesforceRecord.Subdomain__pc = apps[0].subdomain;
    salesforceRecord.pages_url__pc = `https://${apps[0].subdomain}.cent.co`;
    salesforceRecord.Pages_User_Display_Name__pc = apps[0].name;
    salesforceRecord.App_Status_SUB__pc = apps[0].create_date;

    if (apps[0].profile_image !== '/user-icon.png') {
      salesforceRecord.App_Status_STYLED__pc = apps[0].create_date; // App styled date
    }

    const posts = await readPostsByAppID(pool, apps[0].id);
    if (posts.length > 0) {
      salesforceRecord.App_Status_ACTIVE__pc = posts[posts.length - 1].create_date;
      salesforceRecord.Date_of_Last_Post__pc = posts[0].create_date;
    }
    salesforceRecord.Total_Number_of_pages_Posts__pc = posts.length;

    const emailImports = await readEmailImportsByAppID(pool, apps[0].id);
    if (emailImports.length > 0) {
      salesforceRecord.Date_of_Last_Email_Import__pc = emailImports[0].create_date;
      salesforceRecord.Number_of_Emails_Last_Imported__pc = emailImports[0].email_total;
    }
  }

  const waitlistEntries = await readCreatorWaitlistByEmail(pool, users[0].email_address);
  if (waitlistEntries.length > 0) {
    // Confirm date on waitlist
    salesforceRecord.App_Status_CONF__pc = waitlistEntries[0].create_date;
  }

  return salesforceRecord;
}

export async function createCreatorWaitlistEntry(pool: mysql.Pool, email: string, name: string, status = 'PEND'): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `INSERT INTO creator_waitlist (email_address, name, status) VALUES (?, ?, ?)`,
    [email, name, status]
  );
  return String(result.insertId);
}

export async function createAppConfig(pool: mysql.Pool, userID: string, subdomain: string, name: string): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `INSERT INTO app_config (creator_id, subdomain, name, profile_image, style, social_links) VALUES (?,?,?,?,?,?)`,
    [
      userID,
      subdomain,
      name,
      '/user-icon.png',
      JSON.stringify({
        primary_color: null,
        secondary_color: null,
        links: [],
        active_releases: [],
      }),
      JSON.stringify({}),
    ]
  );
  return String(result.insertId);
}

export async function createLink(
  pool: mysql.Pool,
  appConfigID: string,
  label = "",
  url = "",
  image = ""
): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO link (app_id, label, url, image) VALUES (?,?,?,?)
    `,
    [appConfigID, label, url, image]
  );
  return String(result.insertId);
}

export async function createUser(pool: mysql.Pool, email: string, ethAddress: string): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO user (email_address, wallet_address, status)
    VALUES (?,?,?)
    `,
    [email, ethAddress, 'DFLT']
  );
  return String(result.insertId);
}

export async function confirmUser(pool: mysql.Pool, userID: string, ethAddress: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET wallet_address = ?, status = ? WHERE id = ?`, [ethAddress, 'DFLT', userID]
  );
}

export async function createUsersFromImport(pool: mysql.Pool, emails: string[]): Promise<[mysql.OkPacket, mysql.FieldPacket[]]> {
  const result = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO user (email_address, status)
    VALUES ${repeat('(?, "PEND")', emails.length)}
    ON DUPLICATE KEY UPDATE email_address=email_address
    `,
    emails
  );
  return result;
}

export async function createSubscription(pool: mysql.Pool, userID: string, appID: string): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO subscription (subscriber_id, app_id)
    VALUES (?,?)
    `,
    [userID, appID]
  );
  return String(result.insertId);
}

export async function createBulkSubscription(
  pool: mysql.Pool,
  userIDs: string[],
  appID: string,
  emailImportID: string,
): Promise<[mysql.OkPacket, mysql.FieldPacket[]]> {
  const values = [];
  userIDs.forEach(id => {
    values.push(id);
    values.push(appID);
    values.push(emailImportID);
  });
  const result = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO subscription (subscriber_id, app_id, email_import_id)
    VALUES ${repeat('(?, ?, ?)', userIDs.length)}
    `,
    values
  );
  return result;
}

export async function createEmailCampaign(
  pool: mysql.Pool,
  appID: string,
  postID: string,
  numSubs: number,
  sendDate: Date,
): Promise<string> {
  // TODO: if scheduling a send for the future, set PEND/WAIT status here
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO email_campaign (app_id, post_id, sub_total, send_date, status)
    VALUES (?,?,?,?,?)
    `,
    [appID, postID, numSubs, sendDate, 'SEND'],
  );
  return String(result.insertId);
}

export async function createEmailImport(
  pool: mysql.Pool,
  appID: string,
  numEmails: number,
  autoNotify: boolean,
): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO email_import (app_id, email_total, auto_notify, status)
    VALUES (?,?,?,?)
    `,
    [appID, numEmails, autoNotify, 'PEND'],
  );
  return String(result.insertId);
}

export async function createPost(
  pool: mysql.Pool,
  userID: string,
  appID: string,
  collectionID: string,
  title: string,
  body: string,
  style: string,
  styledHTML: string,
  imageURI: string | null,
  contentURI: string,
  tokenURI: string,
  tokenSupplyCap: number | null,
  tokenRoyalty: number,
  tokenPrice: number | null,
  assetURL: string | null,
): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO post (creator_id, app_id, collection_id, title, body, style, styled_html, image_uri, token_uri, token_animation_url, token_supply_cap, token_royalty, token_price, asset_uri)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
    [userID, appID, collectionID, title, body, style, styledHTML, imageURI, tokenURI, contentURI, tokenSupplyCap, tokenRoyalty, tokenPrice, assetURL]
  );
  return String(result.insertId);
}


export async function createPostDraft(
  pool: mysql.Pool,
  uuid: string,
  userID: string,
  appID: string,
  title: string,
  body: string,
  styledHTML: string
): Promise<void> {
  await pool.query(
    `
    INSERT INTO post_draft (uuid, creator_id, app_id, title, body, styled_html)
    VALUES (?,?,?,?,?,?)
    `,
    [uuid, userID, appID, title, body, styledHTML]
  );
}

export async function readPostDraft(
  pool: mysql.Pool,
  uuid: string,
): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM post_draft WHERE uuid = ?
    `,
    [uuid]
  );
  return rows;
}

export async function deletePostDraft(
  pool: mysql.Pool,
  uuid: string,
): Promise<void> {
  await pool.query(
    `
    DELETE FROM post_draft WHERE uuid = ?
    `,
    [uuid]
  );
}

export async function readCreatorWaitlistByEmail(pool: mysql.Pool, email: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM creator_waitlist WHERE email_address = ?`, [email]
  );
  return rows;
}

export async function getNumberOfWaitlistEntries(pool: mysql.Pool, status: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(creator_waitlist.id)
    FROM creator_waitlist
    WHERE status = ?
    `,
    [status]
  );

  return rows[0]['COUNT(creator_waitlist.id)'] || 0;
}


export async function readCreatorWaitlistPaginated(pool: mysql.Pool, offset: number, limit: number, status: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT * FROM creator_waitlist
      WHERE status = ?
      ORDER BY create_date DESC
      LIMIT ? OFFSET ?
    `,
    [status, limit, offset]
  );
  return rows;
}

export async function readProcessingAppConfigs(pool: mysql.Pool): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM app_config WHERE nft_factory_txid IS NOT NULL AND nft_factory_address IS NULL`
  );
  return rows;
}

export async function readCreatorWaitlistByID(pool: mysql.Pool, id: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM creator_waitlist WHERE id = ?`, [id]
  );
  return rows;
}

export async function readAppConfigsBySubdomain(pool: mysql.Pool, subdomain: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM app_config WHERE subdomain = ?`, [subdomain.toLowerCase()]
  );
  return rows;
}

export async function readAppConfigsByIDs(pool: mysql.Pool, appConfigIDs: Array<string>): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT *
    FROM app_config
    WHERE id IN (${repeat('?', appConfigIDs.length)})
    ORDER BY IF(name != '', name, subdomain)`,
    appConfigIDs
  );
  return rows;
}

export async function readAppConfigsPaginated(pool: mysql.Pool, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
     SELECT
        user.email_address AS email_address,
        app_config.id AS id,
        app_config.create_date AS create_date,
        app_config.subdomain AS subdomain,
        app_config.name AS name,
        app_config.profile_image AS profile_image,
        COALESCE(sub.subscribers, 0) AS subscribers
      FROM app_config
      INNER JOIN user ON user.id = app_config.creator_id
      LEFT JOIN (
        SELECT app_id, COUNT(*) AS subscribers 
        FROM subscription 
        WHERE active = true 
        GROUP BY app_id
      )
      sub ON app_config.id = sub.app_id
      ORDER BY create_date DESC
      LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );
  return rows;
}

export async function readAllAppConfigs(pool: mysql.Pool): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT app_config.id appID, app_config.creator_id creator_id
    FROM app_config
    INNER JOIN user ON app_config.id = user.app_id;
    `
  );

  return rows;
}

export async function readProfitableAppConfigs(pool: mysql.Pool): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT app_config.id appID, app_config.creator_id creator_id
    FROM app_config
    INNER JOIN user ON app_config.id = user.app_id AND stripe_id IS NOT NULL;
    `
  );

  return rows;
}

export async function getNumberOfAppConfigEntries(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(app_config.id)
    FROM app_config
    `
  );

  return rows[0]['COUNT(app_config.id)'] || 0;
}

export async function readAppOrigins(pool: mysql.Pool, origin: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM app_origin WHERE origin = ?`, [origin]
  );
  return rows;
}

export async function readLinksByIDs(pool: mysql.Pool, linkIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM link WHERE id IN (${repeat('?', linkIDs.length)})`, linkIDs
  );
  return rows;
}

export async function readUsersByIDs(pool: mysql.Pool, userIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM user WHERE id IN (${repeat('?', userIDs.length)})`, userIDs
  );
  return rows;
}

export async function readUsersByEmail(pool: mysql.Pool, email: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM user WHERE email_address = ?`, [email]
  );
  return rows;
}

export async function readUsersByEmails(pool: mysql.Pool, emails: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM user WHERE email_address IN (${repeat('?', emails.length)})`, emails
  );
  return rows;
}

export async function readUserByStripeID(pool: mysql.Pool, stripeID: string): Promise<mysql.RowDataPacket> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM user WHERE stripe_id = ?`, stripeID
  );

  return rows.length > 0 ? rows[0] : null;
}

export async function readUserIDsByEmail(pool: mysql.Pool, emails: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id FROM user WHERE email_address IN (${repeat('?', emails.length)})`, emails
  );
  return rows;
}

export async function getNumberOfBannedUsers(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(user.id)
    FROM user
    WHERE status = "BNND"
    `,
    []
  );

  return rows[0]['COUNT(user.id)'] || 0;
}


export async function readBannedUsersPaginated(pool: mysql.Pool, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        user.email_address as email_address,
        user.id as id,
        user.status as status,
        app_config.subdomain as subdomain
      FROM user
      LEFT JOIN app_config on app_config.id = user.app_id
      WHERE user.status = "BNND"
      ORDER BY user.create_date DESC
      LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );
  return rows;
}

export async function getNumberOfAdultPages(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(app_config.id)
    FROM app_config
    WHERE adult = 1
    `,
    []
  );

  return rows[0]['COUNT(app_config.id)'] || 0;
}


export async function readAdultPagesPaginated(pool: mysql.Pool, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT id, adult, subdomain
      FROM app_config
      WHERE adult = 1
      ORDER BY app_config.create_date DESC
      LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );
  return rows;
}

export async function readSubscriptionsByIDs(pool: mysql.Pool, subscriptionIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM subscription WHERE id IN (${repeat('?', subscriptionIDs.length)}) AND active = 1`, subscriptionIDs
  );
  return rows;
}

export async function readSubscriptionsActiveByAppIDPaginated(
  pool: mysql.Pool,
  appID: string,
  offset: number,
  limit: number,
): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT *
    FROM subscription
    WHERE app_id = ? AND active = 1
    ORDER BY id ASC
    LIMIT ?,?
    `,
    [
      appID,
      offset,
      limit,
    ]
  );
  return rows;
}

export async function readSubscriptionsActiveByAppIDPaginatedByID(
  pool: mysql.Pool,
  appID: string,
  offsetID: number,
  limit: number,
): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      subscription.*,
      user.email_address,
      user.daily_digest_subscribe
    FROM subscription
    INNER JOIN user
    WHERE
      subscription.app_id = ?
      AND subscription.active = 1
      AND subscription.id > ?
      AND user.id = subscription.subscriber_id
    ORDER BY subscription.id ASC
    LIMIT ?
    `,
    [
      appID,
      offsetID,
      limit,
    ]
  );
  return rows;
}

export async function readSubscriptionsActiveByEmailImportIDPaginated(
  pool: mysql.Pool,
  emailImportID: string,
  offset: number,
  limit: number,
): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT *
    FROM subscription
    WHERE email_import_id = ? AND active = 1
    ORDER BY id ASC
    LIMIT ?,?
    `,
    [
      emailImportID,
      offset,
      limit,
    ]
  );
  return rows;
}

export async function readSubscriptionsBySubscriberID(pool: mysql.Pool, subscriberID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM subscription WHERE subscriber_id = ? AND active = 1`, [subscriberID]
  );
  return rows;
}

export async function readSubscriptionsByAppAndSubscriber(pool: mysql.Pool, userID: string, appID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM subscription
    WHERE app_id = ? AND subscriber_id = ? AND active = 1
    `,
    [
      appID,
      userID,
    ]
  );
  return rows;
}

export async function readSubscribersByAppID(pool: mysql.Pool, appID: string)
  : Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT user.email_address AS Email, subscription.start_date AS 'Start Date'
    FROM subscription
    INNER JOIN user ON user.id = subscription.subscriber_id
    WHERE subscription.app_id = ? AND active = 1
    `,
    [appID]
  );
  return rows;
}

export async function getNumberOfSubscribers(pool: mysql.Pool, appID: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(subscription.id)
    FROM subscription
    WHERE subscription.app_id = ? AND active = 1
    `,
    [appID]
  );

  return rows[0]['COUNT(subscription.id)'] || 0;
}

export async function readSubscribersPaginated(pool: mysql.Pool, appID: string, offset: number, limit: number)
  : Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT user.id AS userId, user.email_address AS userEmail, subscription.id AS subscriptionId, subscription.start_date AS subscriptionDate
    FROM subscription
    INNER JOIN user ON user.id = subscription.subscriber_id
    WHERE subscription.app_id = ? AND active = 1
    ORDER BY
      start_date DESC,
      user.email_address
    LIMIT ? OFFSET ?
    `,
    [appID, limit, offset]
  );
  return rows;
}

export async function readSubscriberIDsByUserIDsAndAppID(
  pool: mysql.Pool,
  userIDs: string[],
  appID: string,
): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT subscriber_id
    FROM subscription
    WHERE subscriber_id IN (${repeat('?', userIDs.length)}) AND app_id = ?
    `,
    userIDs.concat([appID]),
  );
  return rows;
}

export async function readPostsByIDs(pool: mysql.Pool, postIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT post.*, collection.contract_uri, collection.contract_address, collection.version AS contract_version
    FROM post
    LEFT JOIN collection ON post.collection_id = collection.id
    WHERE post.id IN (${repeat('?', postIDs.length)})
    `,
    postIDs
  );
  return rows;
}

export async function readPostByAssetURL(pool: mysql.Pool, assetURL: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT post.*, collection.contract_uri, collection.contract_address, collection.version AS contract_version
    FROM post
    LEFT JOIN collection ON post.collection_id = collection.id
    WHERE post.asset_uri = ?
    ORDER BY post.create_date DESC
    `,
    [assetURL]
  );
  return rows;
}

export async function readPostsByAppID(pool: mysql.Pool, appID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT post.*, collection.contract_uri, collection.contract_address, collection.version AS contract_version
    FROM post
    LEFT JOIN collection ON post.collection_id = collection.id
    WHERE post.app_id = ?
    ORDER BY post.create_date DESC
    `,
    [appID]
  );
  return rows;
}

export async function readEmailImportsByAppID(pool: mysql.Pool, appID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM email_import
    WHERE app_id = ?
    ORDER BY create_date DESC
    `,
    [appID]
  );
  return rows;
}

export async function getNumberOfEmailsImportedByAppID(pool: mysql.Pool, appID: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      COALESCE(SUM(subscription_total), 0) AS sub_total
    FROM email_import
    WHERE app_id = ? AND status = 'CONF'
    `,
    [appID]
  );
  return rows[0].sub_total || 0;
}

export async function readActivePostByAppID(pool: mysql.Pool, appID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT post.*, collection.contract_uri, collection.contract_address, collection.version AS contract_version
    FROM post
    LEFT JOIN collection ON post.collection_id = collection.id
    WHERE post.app_id = ? AND post.active = 1
    ORDER BY post.create_date DESC
    `,
    [appID]
  );
  return rows;
}

export async function getNumberOfPostsInactiveOrHiddenByAppID(pool: mysql.Pool, appID: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(post.id)
    FROM post
    WHERE app_id = ? AND (active IS FALSE OR hidden IS TRUE)
    `,
    [ appID ]
  );

  return rows[0]['COUNT(post.id)'] || 0;
}


export async function readInactiveOrHiddenPostsByAppIDPaginated(pool: mysql.Pool, appID: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT post.*, collection.contract_uri, collection.contract_address, collection.version AS contract_version
    FROM post
    LEFT JOIN collection ON post.collection_id = collection.id
    WHERE post.app_id = ? AND (active IS FALSE OR hidden IS TRUE)
    ORDER BY post.create_date DESC
    LIMIT ? OFFSET ?
    `,
    [
      appID,
      limit,
      offset,
    ]
  );
  return rows;
}

export async function readTokenByUserAndPostIDs(pool: mysql.Pool, userID: string, postIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const values = [userID].concat(postIDs);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM token
    WHERE recipient_id = ? AND source_id IN (${repeat('?', postIDs.length)})
    `,
    values
  );

  return rows;
}

export async function readTokenByPurchaseIDs(pool: mysql.Pool, purchaseIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM token WHERE purchase_id IN (${repeat('?', purchaseIDs.length)})`,
    purchaseIDs
  );

  return rows;
}

export async function readTokensForRetry(pool: mysql.Pool): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM token
    WHERE create_txid IS NULL AND create_date < DATE_SUB(NOW(), INTERVAL 1 HOUR)
    ORDER BY id DESC
    `,
    []
  );

  return rows;
}

export async function readTokenByUserID(pool: mysql.Pool, userID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM token
    WHERE recipient_id = ?
    ORDER BY create_date DESC
    `,
    [userID]
  );

  return rows;
}

export async function readUserTokenPaginated(pool: mysql.Pool, userID: string, sort: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM token
    WHERE recipient_id = ?
    ORDER BY create_date ${sort}
    LIMIT ? OFFSET ?
    `,
    [userID, limit, offset]
  );

  return rows;
}

export async function getUserTokenForDay(pool: mysql.Pool, userID: string,): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(token.id)
    FROM token
    WHERE recipient_id = ? AND purchase_id IS NULL AND create_date > ?
    `,
    [ userID, startOfDay ]
  );

  return rows[0]['COUNT(token.id)'] || 0;
}

export async function getNumberOfUserTokens(pool: mysql.Pool, userID: string,): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(token.id)
    FROM token
    WHERE recipient_id = ?
    `,
    [ userID ]
  );

  return rows[0]['COUNT(token.id)'] || 0;
}
export async function readUserTokenByAppPaginated(pool: mysql.Pool, userID: string, appID: string, sort: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM token
    WHERE recipient_id = ? AND app_id = ?
    ORDER BY create_date ${sort}
    LIMIT ? OFFSET ?
    `,
    [userID, appID, limit, offset]
  );

  return rows;
}

export async function getNumberOfUserTokensByApp(pool: mysql.Pool, userID: string, appID: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(token.id)
    FROM token
    WHERE recipient_id = ? AND app_id = ?
    `,
    [ userID, appID ]
  );

  return rows[0]['COUNT(token.id)'] || 0;
}

export async function readCollectedApps(pool: mysql.Pool, userID: string, sort: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM app_config
    WHERE id IN (
      SELECT DISTINCT app_id
      FROM token
      WHERE recipient_id = ?
    )
    ORDER BY app_config.subdomain ${sort}
    LIMIT ? OFFSET ?
    `,
    [userID, limit, offset]
  );

  return rows;
}

export async function readTokenByIDs(pool: mysql.Pool, tokenIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM token WHERE id IN (${repeat('?', tokenIDs.length)})`, tokenIDs
  );
  return rows;
}

export async function getNumberOfPostCollectors(pool: mysql.Pool, postID: string,): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(token.recipient_id)
    FROM token
    WHERE source_id = ?
    `,
    [ postID ]
  );

  return rows[0]['COUNT(token.recipient_id)'] || 0;
}

export async function readCollectorsOfPostPaginated(pool: mysql.Pool, postID: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      user.email_address AS email_address,
      user.id AS id,
      token.source_id AS source_id,
      token.source_type AS source_type,
      token.create_date AS create_date
    FROM token
    INNER JOIN user ON user.id = token.recipient_id
    WHERE token.source_id = ?
    ORDER BY token.create_date DESC
    LIMIT ? OFFSET ?
    `,
    [
      postID,
      limit,
      offset,
    ]
  );
  return rows;
}

export async function readCollectorsOfPostForExport(pool: mysql.Pool, postID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      user.email_address AS email_address,
      MAX(token.create_date) AS collected_date,
      COUNT(*) AS quantity
    FROM token
    INNER JOIN user ON user.id = token.recipient_id
    WHERE token.source_id = ?
    GROUP BY email_address
    ORDER BY collected_date DESC
    `,
    [postID]
  );
  return rows;
}

export async function updateAppConfigFactoryAddress(
  pool: mysql.Pool,
  appConfigID: string,
  factoryAddress: string
): Promise<void> {
  await pool.query(
    `
      UPDATE app_config
      SET nft_factory_address = ?
      WHERE id = ?
    `,
    [
      factoryAddress,
      appConfigID
    ]
  );
}

export async function updateAppConfigStyle(
  pool: mysql.Pool,
  appConfigID: string,
  style: string
): Promise<void> {
  await pool.query(
    `
      UPDATE app_config
      SET style = ?
      WHERE id = ?
    `,
    [
      style,
      appConfigID
    ]
  );
}

export async function updateAppConfigStatus(
  pool: mysql.Pool,
  appConfigID: string,
  status: string
): Promise<void> {
  await pool.query(
    `
      UPDATE app_config
      SET status = ?
      WHERE id = ?
    `,
    [
      status,
      appConfigID
    ]
  );
}

export async function updateAppConfigCanSendEmail(
  pool: mysql.Pool,
  appConfigID: string,
  canSendEmail: boolean
): Promise<void> {
  await pool.query(
    `
      UPDATE app_config
      SET can_send_email = ?
      WHERE id = ?
    `,
    [
      canSendEmail,
      appConfigID
    ]
  );
}

export async function updateAppConfig(
  pool: mysql.Pool,
  appConfigID: string,
  name: string,
  description: string,
  profileImage: string,
  style: string,
  socialLinks: string,
  backgroundImage: string
): Promise<void> {
  await pool.query(
    `
      UPDATE app_config
      SET
        name = ?,
        description = ?,
        profile_image = ?,
        style = ?,
        social_links = ?,
        background_image = ?
      WHERE id = ?
    `,
    [
      name,
      description,
      profileImage,
      style,
      socialLinks,
      backgroundImage,
      appConfigID
    ]
  );
}

export async function updateEmailCampaignSendTotalAndStatus(
  pool: mysql.Pool,
  id: string,
  newSent: number,
): Promise<void> {
  await pool.query(
    `
      UPDATE email_campaign
      SET
        send_total = send_total + ?,
        status = IF(? = 0, "SENT", "SEND")
      WHERE id = ?
    `,
    [
      newSent,
      newSent,
      id,
    ]
  );
}

export async function updateEmailImportTotalAndStatus(
  pool: mysql.Pool,
  id: string,
  newSubs: number,
  status: string,
): Promise<void> {
  await pool.query(
    `
      UPDATE email_import
      SET
        subscription_total = ?,
        status = ?
      WHERE id = ?
    `,
    [
      newSubs,
      status,
      id,
    ]
  );
}


export async function updatePostHidden(
  pool: mysql.Pool,
  postID: string,
  hidden: boolean,
): Promise<void> {
  await pool.query(
    `
      UPDATE post
      SET hidden = ?
      WHERE id = ?
    `,
    [
      hidden,
      postID
    ]
  );
}

export async function updatePostActive(
  pool: mysql.Pool,
  postID: string,
  active: boolean,
): Promise<void> {
  await pool.query(
    `
      UPDATE post
      SET active = ?
      WHERE id = ?
    `,
    [
      active,
      postID
    ]
  );
}

export async function updateAppAdult(
  pool: mysql.Pool,
  appID: string,
  adult: boolean,
): Promise<void> {
  await pool.query(
    `
      UPDATE app_config
      SET adult = ?
      WHERE id = ?
    `,
    [
      adult,
      appID,
    ]
  );
}

/**
 * This function will create token entry for each user
 *
 * If the supply exceeds the cap or the user already created one for the post, we throw.
 */
export async function createFreeToken(
  pool: mysql.Pool,
  appID: string,
  postID: string,
  userID: string,
  creatorID: string,
  ip: string,
): Promise<string> {
  const conn: mysql.PoolConnection = await pool.getConnection();
  await conn.query('START TRANSACTION', []);
  try {
    // Increase the supply if:
    // 1. we are under the allocated post supply cap
    // 2. the user has not previously claimed the post
    const [allocateTokenResult] = await conn.query<mysql.OkPacket>(
      `
      UPDATE post
      SET token_supply = token_supply + 1
      WHERE
        id = ? AND
        token_supply < IFNULL(token_supply_cap, ?) AND
        id NOT IN (
          SELECT source_id
          FROM token
          WHERE recipient_id = ? AND source_id = ? AND app_id = ? AND source_type = "POST"
        )
      `,
      [
        postID,
        UNLIMITED_TOKEN_BOUNDARY,
        userID,
        postID,
        appID
      ]
    );
    if (allocateTokenResult.affectedRows === 0) {
      throw new Error('Unable to allocate additional token');
    }
    // We increased the supply, now create the token
    const [result] = await conn.query<mysql.OkPacket>(
      `
      INSERT INTO token (
        app_id,
        creator_id,
        recipient_id,
        source_id,
        source_type,
        ip
      )
      VALUES (?,?,?,?,?,?)
      `,
      [
        appID,
        creatorID,
        userID,
        postID,
        'POST',
        ip,
      ]
    );
    const tokenID = String(result.insertId);
    await conn.query('COMMIT');
    await conn.release();
    return tokenID;
  }
  catch (e) {
    await conn.query('ROLLBACK');
    await conn.release();
    throw e;
  }
}

/**
 * This function will generate tokens and update the token supply
 * whenever a stripe payment intent is confirmed (via webhooks).
 *
 * It also supports the case where multiple purchases have the same payment intent.
 *
 * It is all or nothing: if any of the purchases exceed the token supply cap, we throw.
 */
export async function createPurchasedTokens(
  pool: mysql.Pool,
  intentID: string
): Promise<number> {
  const conn: mysql.PoolConnection = await pool.getConnection();
  await conn.query('START TRANSACTION', []);
  try {
    let totalTokens = 0;

    // Select all the `purchase` rows corresponding to stripe's payment intent
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `
      SELECT * FROM purchase
      WHERE intent_id = ? AND status NOT IN (?,?)
      FOR UPDATE
      `,
      [intentID, PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELED]
    );
    for (const row of rows) {
      const newTokens = row.nft_amount;

      // Prepare the data for the new tokens to create
      const values = [];
      for (let i = 0; i < newTokens; i++) {
        values.push(row.app_id, row.creator_id, row.recipient_id, row.source_id, 'POST', row.id, row.ip);
      }

      // Perform the `token` creation
      await conn.query<mysql.OkPacket>(
        `
        INSERT INTO token (
          app_id,
          creator_id,
          recipient_id,
          source_id,
          source_type,
          purchase_id,
          ip
        )
        VALUES ${repeat('(?,?,?,?,?,?,?)', newTokens)}
        `,
        values
      );

      // Update the token supply tracker, bailing if we are over the limit
      const [allocateTokenResult] = await conn.query<mysql.OkPacket>(
        `
        UPDATE post
        SET token_supply = token_supply + ?
        WHERE id = ? AND (token_supply + ?) <= IFNULL(token_supply_cap, ?)
        `,
        [
          newTokens,
          row.source_id,
          newTokens,
          UNLIMITED_TOKEN_BOUNDARY
        ]
      );
      if (allocateTokenResult.affectedRows === 0) {
        throw new Error('Token limit exceeded');
      }
      totalTokens += newTokens;
    }
    await conn.query<mysql.OkPacket>(
      `
      UPDATE purchase
      SET status = ?
      WHERE intent_id = ?
      `,
      [PURCHASE_STATUS.COMPLETED, intentID]
    );
    await conn.query('COMMIT');
    await conn.release();
    return totalTokens;
  }
  catch (e) {
    await conn.query('ROLLBACK');
    await conn.release();
    throw e;
  }
}

export async function updateLinks(pool: mysql.Pool, linkData: any[]): Promise<void> {
  const values = [];
  linkData.forEach(l => {
    values.push(l.id);
    values.push(l.app_id);
    values.push(l.label);
    values.push(l.url);
    values.push(l.image);
    values.push(l.deleted);
  });
  await pool.query<mysql.OkPacket>(
    `
    INSERT INTO link (id, app_id, label, url, image, deleted)
    VALUES ${repeat('(?,?,?,?,?,?)', linkData.length)}
    ON DUPLICATE KEY UPDATE
      label=VALUES(label),
      url=VALUES(url),
      image=VALUES(image),
      deleted=VALUES(deleted)
    `,
    values
  );
}

export async function updateUserAppConfig(pool: mysql.Pool, userID: string, appConfigID: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET app_id = ? WHERE id = ? AND app_id IS NULL`, [appConfigID, userID]
  );
}

export async function updateUserStripeID(pool: mysql.Pool, userID: string, stripeID: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET stripe_id = ? WHERE id = ?`, [stripeID, userID]
  );
}

export async function updateUserStripeCustomerID(pool: mysql.Pool, userID: string, stripeCustomerID: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET stripe_customer_id = ? WHERE id = ?`, [stripeCustomerID, userID]
  );
}

export async function updateUserStatus(pool: mysql.Pool, userID: string, status: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET status = ? WHERE id = ?`, [status, userID]
  );
}

export async function updateUserDisplayName(pool: mysql.Pool, userID: string, displayName: string | null): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET display_name = ? WHERE id = ?`, [displayName, userID]
  );
}

export async function updateUserDigest(pool: mysql.Pool, userID: string, dailyDigest: boolean): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET daily_digest_subscribe = ? WHERE id = ?`, [dailyDigest, userID]
  );
}

export async function acceptTermsConditions(pool: mysql.Pool, userID: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE user SET terms_conditions_accepted_date = NOW() WHERE id = ?`, [userID]
  );
}

export async function updateTokenTxn(pool: mysql.Pool, nftContract: string | null, tokenID: string, createTXID: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE token SET contract_address = ?, create_txid = ? WHERE id = ?`,
    [nftContract, createTXID, tokenID]
  );
}

export async function updateTokensMintStatus(pool: mysql.Pool, ids: string[], status: any): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE token SET minted = ?, mint_check_date = NOW() WHERE id IN (${repeat('?', ids.length)})`,
    [status].concat(ids)
  );
}

export async function updateTokenTransfer(pool: mysql.Pool, tokenID: string, transferID: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE token SET transfer_id = ? WHERE id = ?`, [transferID, tokenID]
  );
}

export async function updateWaitlistStatus(pool: mysql.Pool, email: string, status: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE creator_waitlist SET status = ? WHERE email_address = ?`, [status, email]
  );
}

export async function unsubscribe(pool: mysql.Pool, subscriptionID: string): Promise<void> {
  await pool.query(
    `
      UPDATE subscription
      SET
        end_date = ?,
        active = ?
      WHERE id = ?
    `,
    [
      new Date(),
      null,
      subscriptionID
    ]
  );
}

export async function deactivatePosts(pool: mysql.Pool, postIDs: string[]): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE post SET active = ? WHERE id IN (${repeat('?', postIDs.length)})`, ['0'].concat(postIDs)
  );
}

/* ANALYTICS */

async function _subscriberCountDateRange(pool: mysql.Pool, appID, dateField: string, endDate: Date, startDate: Date): Promise<number> {
  const [subs] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(DISTINCT subscription.subscriber_id) as subscriber_count FROM subscription
    WHERE app_id = ?
      AND ${dateField} <= ?
      AND ${dateField} > ?
    `,
    [
      appID,
      endDate,
      startDate,
    ]
  );
  return subs[0]['subscriber_count'] || 0;
}

type SubsciberStatType = {
  newNetSubscriptions: number;
  prevNetSubscriptions?: number;
}
export async function getSubscriberStats(pool: mysql.Pool, appID: string, days: number, allTime: boolean): Promise<SubsciberStatType> {
  const timeRange = days * 24 * 60 * 60 * 1000;
  const today = new Date();
  const currentStartDate = new Date(today.getTime() - timeRange);
  const newSub = await _subscriberCountDateRange(pool, appID, 'start_date', today, currentStartDate);
  const newUnsub = await _subscriberCountDateRange(pool, appID, 'end_date', today, currentStartDate);
  const response: SubsciberStatType = {
    newNetSubscriptions: newSub - newUnsub,
  };
  if (!allTime) {
    const prevStartDate = new Date(currentStartDate.getTime() - timeRange);
    const prevSub = await _subscriberCountDateRange(pool, appID, 'start_date', currentStartDate, prevStartDate);
    const prevUnsub = await _subscriberCountDateRange(pool, appID, 'end_date', currentStartDate, prevStartDate);
    response.prevNetSubscriptions = prevSub - prevUnsub;
  }
  return response;
}

type PaymentStatType = {
  new: {
    total_nfts: number;
    total_proceeds: number;
  };
  previous?: {
    total_nfts: number;
    total_proceeds: number;
  };
}
export async function getPaymentStats(pool: mysql.Pool, appID: string, days: number, allTime: boolean): Promise<PaymentStatType> {
  const timeRange = days * DAY_INTERVAL * 1000;
  const today = new Date();
  const currentEndDate = new Date(today.getTime() - timeRange);
  const [newStats] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      COALESCE(SUM(nft_amount), 0) AS total_nfts,
      COALESCE(SUM(total_price), 0) - COALESCE(SUM(seller_fee), 0) AS total_proceeds
    FROM purchase
    WHERE app_id = ?
    AND status = ?
    AND update_date <= ?
    AND update_date > ?
    `,
    [
      appID,
      PURCHASE_STATUS.COMPLETED,
      today,
      currentEndDate,
    ]
  );
  const response: PaymentStatType = {
    new: {
      total_nfts: parseInt(newStats[0].total_nfts),
      total_proceeds: parseInt(newStats[0].total_proceeds),
    },
  };
  if (!allTime) {
    const previousEndDate = new Date(currentEndDate.getTime() - timeRange);
    const [prevStats] = await pool.query<mysql.RowDataPacket[]>(
      `
      SELECT
        COALESCE(SUM(nft_amount), 0) AS total_nfts,
        COALESCE(SUM(total_price), 0) - COALESCE(SUM(seller_fee), 0) AS total_proceeds
      FROM purchase WHERE app_id = ?
        AND status = ?
        AND update_date <= ?
        AND update_date > ?
      `,
      [
        appID,
        PURCHASE_STATUS.COMPLETED,
        currentEndDate,
        previousEndDate,
      ]
    );
    response.previous = {
      total_nfts: parseInt(prevStats[0].total_nfts),
      total_proceeds: parseInt(prevStats[0].total_proceeds),
    };
  }
  return response;
}

function _formatStatArray(startDate: Date, endDate: Date, interval: number, stats: mysql.RowDataPacket[]) {
  const bucketMap = {};
  const statArray = [];
  stats.forEach(stat => bucketMap[stat.bucket * 1000] = stat.count);
  for (let bucket = startDate.getTime(); bucket < endDate.getTime(); bucket += interval) {
    statArray.push({
      bucket,
      count: bucketMap[bucket] || 0,
    });
  }
  return statArray;
}

export async function getCollectStats(pool: mysql.Pool, appID: string, days: number): Promise<mysql.RowDataPacket[]> {
  const today = new Date();
  const offset = days > 30 ? DAY_INTERVAL * 4 : 0; // Unix Week starts on Wednesday
  const interval = days > 30 ? WEEK_INTERVAL : DAY_INTERVAL;
  const unroundedStartMillis = today.getTime() - (days * DAY_INTERVAL * 1000);
  const startDate = new Date(
    unroundedStartMillis
    - (unroundedStartMillis % (interval * 1000)) // Rounded down to the nearest day/week
    - (offset * 1000)                            // Rewinded to Sunday, if this is a week (Unix Week starts on Wednesday)
  );

  const [collectStats] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT (
        UNIX_TIMESTAMP(create_date)
        - ((UNIX_TIMESTAMP(create_date) + ?) % ?)
      ) AS bucket,
        COUNT(DISTINCT COALESCE(id,0)) AS count
      FROM token
      WHERE app_id = ? AND create_date >= ?
      GROUP BY bucket
    `,
    [
      offset,
      interval,
      appID,
      startDate,
    ]
  );
  return _formatStatArray(startDate, today, interval * 1000, collectStats);
}

export async function getCollectorStats(pool: mysql.Pool, appID: string, days: number): Promise<mysql.RowDataPacket[]> {
  const today = new Date();
  const offset = days > 30 ? DAY_INTERVAL * 4 : 0;
  const interval = days > 30 ? WEEK_INTERVAL : DAY_INTERVAL;
  const unroundedStartMillis = today.getTime() - (days * DAY_INTERVAL * 1000);
  const startDate = new Date(
    unroundedStartMillis
    - (unroundedStartMillis % (interval * 1000)) // Rounded down to the nearest day/week
    - (offset * 1000)                            // Rewinded to Sunday, if this is a week (Unix Week starts on Wednesday)
  );
  const [collectorStats] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT (
        UNIX_TIMESTAMP(create_date)
        - ((UNIX_TIMESTAMP(create_date) + ?) % ?)
      ) AS bucket,
        COUNT(DISTINCT recipient_id) AS count
      FROM token
      WHERE app_id = ? AND create_date >= ?
      GROUP BY bucket
    `,
    [
      offset,
      interval,
      appID,
      startDate,
    ]
  );
  return _formatStatArray(startDate, today, interval * 1000, collectorStats);
}

export async function getTopReleases(pool: mysql.Pool, appID: string, days: number, limit: number, offset: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT id, title, create_date, token_supply
      from post
      WHERE app_id = ?
        AND create_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY token_supply DESC
      LIMIT ? OFFSET ?
    `,
    [
      appID,
      days,
      limit,
      offset,
    ]
  );
  return rows;
}
/* ADMIN QUERIES */

export async function executeQueryReadOnly(pool: mysql.Pool, query: string): Promise<mysql.RowDataPacket[]> {
  if (query.toLowerCase().indexOf('set') > -1) {
    throw new Error('Aborting. Dangerous query');
  }
  const conn: mysql.PoolConnection = await pool.getConnection();
  try {
    await conn.query('SET @@SESSION.transaction_read_only = 1');
    const [rows] = await conn.query<mysql.RowDataPacket[]>(query);
    await conn.query('SET @@SESSION.transaction_read_only = 0');
    conn.release();
    return rows;
  }
  catch (e) {
    await conn.query('SET @@SESSION.transaction_read_only = 0');
    conn.release();
    throw e;
  }
}

export async function getNumberOfNewSubscribers(pool: mysql.Pool, appID: string, days: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(DISTINCT subscription.subscriber_id) FROM subscription
    WHERE app_id = ?
      AND active = 1
      AND start_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `,
    [
      appID,
      days,
    ]
  );

  return rows[0]['COUNT(DISTINCT subscription.subscriber_id)'] || 0;
}

export async function getNumberOfNewReleases(pool: mysql.Pool, appID: string, days: string | number): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(post.id) FROM post
    WHERE app_id=?
      AND create_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `,
    [
      appID,
      days,
    ]
  );

  return rows[0]['COUNT(post.id)'] || 0;
}

export async function getNumberOfNewMints(pool: mysql.Pool, appID: string, days: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(token.id) FROM token
    WHERE app_id = ?
      AND create_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `,
    [
      appID,
      days,
    ]
  );

  return rows[0]['COUNT(token.id)'] || 0;
}

export async function getNumberOfNewUnsubscribe(pool: mysql.Pool, appID: string, days: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(DISTINCT subscription.subscriber_id) FROM subscription
    WHERE subscription.app_id = ?
      AND active IS NULL
      AND subscription.end_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `,
    [
      appID,
      days,
    ]
  );

  return rows[0]['COUNT(DISTINCT subscription.subscriber_id)'] || 0;
}

export async function createTransfer(pool: mysql.Pool, tokenId: string, tokenContract: string, recipientAddress: string): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO transfer (token_id, token_contract, recipient_address)
    VALUES (?,?,?)
    `,
    [tokenId, tokenContract, recipientAddress]
  );
  return String(result.insertId);
}

export async function readTransferByIDs(pool: mysql.Pool, transferIds: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM transfer WHERE id IN (${repeat('?', transferIds.length)})`, transferIds
  );

  return rows;
}

export async function updateTransferByID(pool: mysql.Pool, transferId: string, txnId: string, status: TRANSFER_STATUS): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE transfer SET txn_id = ?, status = ?, update_date = ? WHERE id = ?`, [txnId, status, new Date(), transferId]
  );
}

/**
 * For NFTs that require payment, use the `purchase.nft_amount` to track supply
 * before updating the `post.token_supply` field.
 *
 * Perform this check-and-increment atomically (i.e. inside a db transaction)
 */
export async function lockTokensAndCreatePurchase(
  pool: mysql.Pool,
  appId: string,
  creatorId: string,
  recipientId: string,
  sourceType: string,
  sourceId: string,
  title: string,
  nftAmount: number,
  tokenPrice: number,
  totalPrice: number,
  buyerFee: number,
  sellerFee: number,
  tokenSupplyCap: number,
  ip: string,
): Promise<string> {
  const conn: mysql.PoolConnection = await pool.getConnection();
  await conn.query('START TRANSACTION', []);
  try {
    const [purchaseTotal] = await conn.query<mysql.RowDataPacket[]>(
      `
      SELECT CAST(
        COALESCE(SUM(nft_amount), 0)
      AS UNSIGNED) AS allocated
      FROM purchase
      WHERE source_id = ? AND status != ?
      FOR UPDATE
      `,
      [sourceId, PURCHASE_STATUS.CANCELED]
    );
    if (purchaseTotal[0].allocated + nftAmount > tokenSupplyCap) {
      throw new Error('Token limit reached');
    }
    const [result] = await conn.query<mysql.OkPacket>(
      `
      INSERT INTO purchase (
        app_id,
        creator_id,
        recipient_id,
        source_type,
        source_id,
        title,
        nft_amount,
        token_price,
        total_price,
        buyer_fee,
        seller_fee,
        ip
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [appId, creatorId, recipientId, sourceType, sourceId, title, nftAmount, tokenPrice, totalPrice, buyerFee, sellerFee, ip]
    );
    const purchaseId = String(result.insertId);
    await conn.query('COMMIT');
    await conn.release();
    return purchaseId;
  }
  catch (e) {
    await conn.query('ROLLBACK');
    await conn.release();
    throw e;
  }
}

export async function updatePurchaseStatus(pool: mysql.Pool, purchaseId: string, status: PURCHASE_STATUS): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `
    UPDATE purchase
    SET
      status = ?,
      update_date = ?
    WHERE
      id = ? AND
      status != ? AND
      status != ?
    `,
    [status, new Date(), purchaseId, PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELED]
  );
}

export async function updatePurchaseStatusWithIntentID(pool: mysql.Pool, intentId: string, status: PURCHASE_STATUS): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `
    UPDATE purchase
    SET
      status = ?,
      update_date = ?
    WHERE
      intent_id = ? AND
      status != ? AND
      status != ?
    `,
    [status, new Date(), intentId, PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELED]
  );
}

export async function updatePurchaseIntent(pool: mysql.Pool, purchaseId: string, intentId: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE purchase SET intent_id = ?, update_date = ? WHERE id = ?`,
    [intentId, new Date(), purchaseId]
  );
}

export async function getNumberOfPurchasesByApp(pool: mysql.Pool, appID: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(*) AS total
    FROM purchase
    WHERE app_id = ? AND status = ?
    `,
    [appID, PURCHASE_STATUS.COMPLETED]
  );
  return rows[0].total || 0;
}


export async function getPurchaseByAppPaginated(pool: mysql.Pool, appID: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT * FROM purchase
      WHERE app_id = ? AND status = ?
      ORDER BY create_date DESC
      LIMIT ? OFFSET ?
    `,
    [appID, PURCHASE_STATUS.COMPLETED, limit, offset]
  );
  return rows;
}

export async function getPurchaseAggregatesByApp(pool: mysql.Pool, appID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      COALESCE(SUM(nft_amount), 0) AS total_nfts,
      COALESCE(SUM(total_price), 0) - COALESCE(SUM(seller_fee), 0) AS total_proceeds,
      COUNT(DISTINCT recipient_id) AS total_recipients
    FROM purchase WHERE app_id = ? AND status = ?
    `,
    [appID, PURCHASE_STATUS.COMPLETED]
  );
  return rows;
}

export async function getPurchasesIncompletedOlder(pool: mysql.Pool): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM purchase
    WHERE (status = ? OR status = ?) AND create_date < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
    `,
    [PURCHASE_STATUS.CREATED, PURCHASE_STATUS.FAILED]
  );

  return rows;
}

export async function getNumberOfPurchasesByUser(pool: mysql.Pool, userId: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(*) AS total
    FROM purchase
    WHERE recipient_id = ? AND status IN (?,?)
    `,
    [userId, PURCHASE_STATUS.PENDING, PURCHASE_STATUS.COMPLETED]
  );
  return rows[0].total || 0;
}

export async function getUserPurchases(pool: mysql.Pool, userId: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT purchase.*, app_config.name AS creator FROM purchase
    INNER JOIN app_config ON app_config.id = purchase.app_id
    WHERE recipient_id = ? AND purchase.status IN (?,?)
    ORDER BY update_date DESC
    LIMIT ? OFFSET ?
    `,
    [userId, PURCHASE_STATUS.PENDING, PURCHASE_STATUS.COMPLETED, limit, offset]
  );

  return rows;
}

export async function getPurchaseByIntent(pool: mysql.Pool, intentId: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM purchase WHERE intent_id = ?`, [intentId]
  );

  return rows;
}

export async function getPurchaseByID(pool: mysql.Pool, purchaseId: string): Promise<mysql.RowDataPacket> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM purchase WHERE id = ?`, [purchaseId]
  );

  return rows[0];
}

export async function getPurchasesIncompletedByPostID(pool: mysql.Pool, postID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT id, nft_amount
    FROM purchase
    WHERE source_id = ? AND NOT status = 'COMPLETED'
    `,
    [postID]
  );

  return rows;
}

export async function createPayout(
  pool: mysql.Pool,
  appID: string,
  userID: string,
  payoutID: string,
  amount: number,
  currency: string,
  isAutomatic: boolean,
  status: string,
  createdDate: string,
  arrivalDate: string,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO payout (app_id, creator_id, payout_id, amount, currency, is_automatic, status, created_date, arrival_date)
    VALUES (?,?,?,?,?,?,?,?,?)
    `,
    [appID, userID, payoutID, amount, currency, isAutomatic, status, createdDate, arrivalDate]
  );
}

export async function updatePayout(
  pool: mysql.Pool,
  payoutID: string,
  amount: number,
  currency: string,
  isAutomatic: boolean,
  status: string,
  createdDate: string,
  arrivalDate: string,
): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `
      UPDATE payout
      SET
        amount = ?,
        currency = ?,
        is_automatic = ?,
        status = ?,
        created_date = ?,
        arrival_date = ?
      WHERE payout_id = ?
    `,
    [amount, currency, isAutomatic, status, createdDate, arrivalDate, payoutID]
  );
}

export async function updatePayoutStatus(pool: mysql.Pool, payoutID: string, status: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `UPDATE payout SET status = ? WHERE payout_id = ?`, [status, payoutID]
  );
}

export async function createCollection(
  pool: mysql.Pool,
  appID: string,
  contractURI: string,
  creatorAddress: string,
  royaltyAddress: string,
  royaltyRate: number,
  tokenName: string,
  tokenSymbol: string,
  version: number,
): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO collection (
      app_id,
      contract_uri,
      creator_address,
      royalty_address,
      royalty_rate,
      token_name,
      token_symbol,
      version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [appID, contractURI, creatorAddress, royaltyAddress, royaltyRate, tokenName, tokenSymbol, version]
  );
  return String(result.insertId);
}

export async function readCollectionsByContractURI(pool: mysql.Pool, contractURI: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM collection
    WHERE contract_uri = ?
    `,
    [contractURI]
  );

  return rows;
}

export async function readCollectionsByAppID(pool: mysql.Pool, appID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM collection
    WHERE app_id = ?
    `,
    [appID]
  );

  return rows;
}

export async function readCollectionsMissingContractAddress(pool: mysql.Pool): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM collection
    WHERE contract_address IS NULL AND id IN (
      SELECT collection_id FROM post
      WHERE collection_id IS NOT NULL AND token_supply > 0
    )
    ORDER BY id ASC
    LIMIT 0, 100
    `,
    []
  );

  return rows;
}

export async function readTokensUnminted(pool: mysql.Pool): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT token.id, collection.contract_address, collection.contract_uri, collection.version
    FROM token
    INNER JOIN post ON token.source_id = post.id
    LEFT JOIN collection ON post.collection_id = collection.id
    WHERE token.minted IS FALSE
    ORDER BY token.mint_check_date ASC LIMIT 0, 500
    `,
    []
  );

  return rows;
}

export async function readCollectionsByIDs(pool: mysql.Pool, ids: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM collection
    WHERE id IN (${repeat('?', ids.length)})
    `,
    ids
  );

  return rows;
}

export async function updateCollectionFactoryAddress(pool: mysql.Pool, contractURI: string, contractAddress: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `
    UPDATE collection
    SET contract_address = ?
    WHERE contract_uri = ?
    `,
    [contractAddress, contractURI]
  );
}

// INVITE LINKS
export async function readInviteLinkByUserID(pool: mysql.Pool, userID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      invite_link.*,
      app_config.subdomain,
      app_config.name
    FROM invite_link
    LEFT JOIN app_config ON app_config.creator_id = invite_link.user_id
    WHERE invite_link.user_id = ?
    `,
    userID
  );

  return rows;
}

export async function readInviteLinkByID(pool: mysql.Pool, inviteIDs: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM invite_link
    WHERE id IN (${repeat('?', inviteIDs.length)})
    `,
    inviteIDs
  );

  return rows;
}

export async function readInviteLinkByCode(pool: mysql.Pool, code: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      invite_link.*,
      app_config.subdomain,
      app_config.name,
      user.id AS user_id
    FROM invite_link
    INNER JOIN app_config ON app_config.creator_id = invite_link.user_id
    INNER JOIN user ON app_config.id = user.app_id
    WHERE code = ?
    `,
    code
  );

  return rows;
}

export async function getNumberOfInviteLinks(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(invite_link.id)
    FROM invite_link
    `,
  );

  return rows[0]['COUNT(invite_link.id)'] || 0;
}

export async function readInviteLinks(pool: mysql.Pool, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      invite_link.*,
      user.email_address,
      COALESCE (signups.total_count, 0) AS signup_count
    FROM invite_link
    LEFT JOIN user ON user.id = invite_link.user_id
    LEFT JOIN (
      SELECT link_id, COUNt(*) AS total_count
      from invite_link_signup
      GROUP BY link_id
    )
    signups ON invite_link.id = signups.link_id
    ORDER BY signup_count DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );

  return rows;
}

export async function createInviteLink(pool: mysql.Pool, userID: number, code: string): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `INSERT INTO invite_link (user_id, code, signup_limit) VALUES (?, ?, ?)`,
    [userID, code, INVITE_LIMIT]
  );
  return String(result.insertId);
}

export async function getNumberOfSingupsByLinkID(pool: mysql.Pool, linkID: string): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT COUNT(invite_link_signup.id)
    FROM invite_link_signup
    WHERE link_id = ?
    `,
    [linkID]
  );

  return rows[0]['COUNT(invite_link_signup.id)'] || 0;
}

export async function readInviteSignupByLinkID(pool: mysql.Pool, linkID: string, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT
      invite_link_signup.*,
      app_config.subdomain,
      app_config.name,
      app_config.profile_image
    FROM invite_link_signup
    LEFT JOIN app_config ON app_config.id = invite_link_signup.app_id
    WHERE link_id = ?
    ORDER BY invite_link_signup.create_date DESC
    LIMIT ? OFFSET ?
    `,
    [linkID, limit, offset]
  );

  return rows;
}

export async function readInviteSignupByUserID(pool: mysql.Pool, userID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM invite_link_signup
    WHERE user_id = ?
    `,
    [userID]
  );

  return rows;
}


export async function readInviteSignupByID(pool: mysql.Pool, signupID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT * FROM invite_link_signup
    WHERE id = ?
    `,
    [signupID]
  );

  return rows;
}


export async function createInviteSignup(pool: mysql.Pool, userID: string, appID: string, linkID: string): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO invite_link_signup (user_id, app_id, link_id)
    VALUES (?,?,?)
    `,
    [userID, appID, linkID]
  );
  return String(result.insertId);
}

export async function getCollectorsByApp(pool: mysql.Pool, appID: string, offset: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT recipient_id AS user_id,
      COUNT(DISTINCT source_id) AS num_collects,
      MIN(create_date) AS first_collect,
      MAX(create_date) AS last_collect
    FROM token
    WHERE app_id = ?
    GROUP BY recipient_id
    ORDER BY num_collects DESC, first_collect DESC
    LIMIT ?,50
    `,
    [appID, parseInt(offset)]
  );

  return rows;
}

export async function getAppsRecentlyCollectedByUser(pool: mysql.Pool, userID: string): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT MAX(token.create_date) AS last_collect, app_config.*
    FROM token
    LEFT JOIN app_config ON token.app_id = app_config.id
    WHERE token.recipient_id = ?
    GROUP BY token.app_id
    ORDER BY last_collect DESC
    LIMIT 0,5
    `,
    [userID]
  );

  return rows;
}

export async function getPostsGloballyWithAppInfo(pool: mysql.Pool, offset: number, limit: number): Promise<mysql.RowDataPacket[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT post.id,
      post.token_supply,
      post.token_supply_cap,
      post.token_price,
      app_config.subdomain,
      app_config.name
    FROM post
    INNER JOIN app_config ON post.app_id = app_config.id
    WHERE app_config.is_private IS FALSE
      AND app_config.status = "DFLT"
      AND app_config.adult IS FALSE
      AND post.active IS TRUE
    ORDER BY post.create_date DESC
    LIMIT ?,?
    `,
    [offset, limit]
  );
  return rows;
}

export async function createPhoneVerificationRecord(pool: mysql.Pool, userId: number, token: string): Promise<string> {
  const [result] = await pool.query<mysql.OkPacket>(
    `
    INSERT INTO phone_verification (
      user_id,
      token,
      status
    ) VALUES (?, ?, ?)`,
    [userId, token, 'CREATED']
  );

  return String(result.insertId);
}

export async function getPhoneVerificationRecord(pool: mysql.Pool, recordId: string): Promise<mysql.RowDataPacket> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
    SELECT *
    FROM phone_verification
    WHERE id = ? AND status != 'PASSED'
    `,
    [recordId]
  );

  return rows[0];
}

export async function updatePhoneVerificationRecord(pool: mysql.Pool, recordId: string, status: string): Promise<void> {
  await pool.query<mysql.OkPacket>(
    `
    UPDATE phone_verification
    SET status = ?, update_date = ?
    WHERE id = ?
    `,
    [status, new Date(), recordId]
  );
}
