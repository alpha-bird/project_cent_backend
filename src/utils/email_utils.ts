import juice from 'juice';
import { APP_ENV } from '../interface/app';

/* eslint no-useless-escape: "off" */
const iframeRegexMatch = /<iframe\s+.*?\s+src=("[^"]+").*?<\/iframe>/g;
const iframeSourceRegexMatch = /\<iframe.+src\=(?:\"|\')(.+?)(?:\"|\')(?:.+?)<\/iframe>/;
const audioRegexMatch = /<audio\s+.*?\s+src=("[^"]+").*?<\/audio>/g;
const videoRegexMatch = /<video\s+.*?\s+src=("[^"]+").*?<\/video>/g;

// Common styling for buttons
const BUTTON_STYLING = `
  text-decoration: none;
  cursor: pointer;
  border-radius: 12px;
  text-decoration: none;
  font-weight: bold;
  font-size: 18px;
`;

export const transformPostForEmail = (
  postBody: string,
  title: string,
  subdomain: string,
  appName: string,
  appProtocol: string,
  appHostname: string,
  appEnv: string,
  tokenSupplyCap: number | null,
  primaryColor?: string,
  secondaryColor?: string,
): string => {
  if (!postBody) {
    return '';
  }
  const domain = `${subdomain}.${appHostname}`;

  const publicURL = () => {
    switch(appEnv) {
      case APP_ENV.PROD:
        return 'https://service.cent.co/public';
      case APP_ENV.DEV:
        return 'https://service.cent.dev/public';
      case APP_ENV.LOCAL:
        return 'http://127-0-0-1.sslip.io:3500/public';
      default:
        return '';
      }
    }

  let formattedBody = postBody;
  const iframesrc = postBody.match(iframeRegexMatch);
  if (iframesrc && iframesrc.length > 0) {
    iframesrc.forEach((iframeContent, index) => {
      const iframesrc = iframeContent.match(iframeSourceRegexMatch);
      const src = iframesrc ? iframesrc[1] : null;
      if (iframeContent.indexOf('aib-youtube') > -1) {
        const splitSource = src?.split('/');
        const videoPath = splitSource ? splitSource[4] : null;
        const youtubeImage = `
          <div style="text-align: center">
            <a href="${src}" target="_blank">
              <img
                src="https://img.youtube.com/vi/${videoPath}/0.jpg"
                style="
                  width: 100%;
                  max-width: 100%;
                  margin: 0 auto;
                "
              />
            </a>
          </div>
        `;
        formattedBody = formattedBody.replace(
          iframeContent,
          youtubeImage
        );
      } else if (iframeContent.indexOf('aib-soundcloud') > -1) {
        const soundcloudImage = `
        <div style="text-align: center">
          <a
            href="${src}"
            target="_blank"
          >
            <img
              style="height: 42px;"
              src="${publicURL()}/soundcloud-button.png"
              alt="Listen on SoundCloud 🎧"
            />
          </a>
        </div>
        `;
        formattedBody = formattedBody.replace(
          iframeContent,
          soundcloudImage
        );
      } else if (iframeContent.indexOf('aib-spotify') > -1) {
        const spotifyImage = `
        <div style="text-align: center">
          <a
            href="${src}"
            target="_blank"
          >
            <img
              style="height: 42px;"
              src="${publicURL()}/spotify-button.png"
              alt="Listen on Spotify 🎧"
            />
          </a>
        </div>
        `;
        formattedBody = formattedBody.replace(
          iframeContent,
          spotifyImage
        );
      } else if (iframeContent.indexOf('aib-apple_music') > -1) {
        const appleLink = src?.replace('embed.', '');
        const appleImage = `
        <div style="text-align: center">
          <a
            href="${appleLink}"
            target="_blank"
          >
              <img
                src="${publicURL()}/apple-music-badge.png"
                alt="Listen on Apple Music"
                style="height: 42px;"
              />
          </a>
        </div>
        `;
        formattedBody = formattedBody.replace(
          iframeContent,
          appleImage
        );
      }
    })
  }
  formattedBody = formattedBody.replace(
    videoRegexMatch,
    `<div style="text-align: center">
      <a
        href="${appProtocol}://${domain}"
        target="_blank"
        style="
          ${BUTTON_STYLING}
          background-color: white;
          color: black;
          width: 250px;
          padding: 8px 16px;
        "
      >
        Watch ▶
      </a>
    </div>`
  );

  formattedBody = formattedBody.replace(
    audioRegexMatch,
    `<div style="text-align: center">
      <a
        href="${appProtocol}://${domain}"
        target="_blank"
        style="
          ${BUTTON_STYLING}
          background-color: white;
          color: black;
          width: 250px;
          padding: 8px 16px;
        "
      >
        Listen 🎧
      </a>
    </div>`
  );


  const emailBodyWithStyleTag = `
    <style>
      .embed-container {
        position: relative;
        width: 100%;
        margin-top: 16px;
      }
      .bulletin-image {
        width: 100%;
        max-width: 100%;
        margin: 16px auto 0;
      }
      a, a:hover, a:visited {
        color: ${secondaryColor || 'white'};
      }
      div {
        min-height: 1em;
      }
    </style>
    ${formattedBody}
  `;
  const styledBody = juice(emailBodyWithStyleTag);

  return `
    <div
      style="
        padding: 16px;
        font-family: 'Helvetica';
        line-height: 125%;
        font-size: 18px;
        background-color: #111111;
        color: white;
      "
    >
      <div style="display:none;">${formattedBody}</div>
      <div
        style="
          max-width: 600px;
          margin: 0 auto;
        "
      >
        <div
          style="
            padding: 32px 16px;
            border-radius: 12px;
            background-color: ${primaryColor || '#222222'};
            color: ${secondaryColor || 'white'};
          "
        >
          <div
            style="
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 16px;
              width: 100%;
            "
          >
            ${title}
          </div>
          <div
            style="
              width: 100%;
              font-size: 16px;
            "
          >
            ${styledBody}
          </div>
        </div>
        <div style="text-align: center; margin-top: 24px;">
          <a
            style="
              ${BUTTON_STYLING}
              background-color: #2B8541;
              color: white;
              width: 203px;
              padding: 8px 16px;
            "
            href="${appProtocol}://${domain}"
          >
            ${tokenSupplyCap === 0 ? 'View this post' : 'Collect this post'}
          </a>
        </div>
        <div
          style="
            text-align: center;
            max-width: 600px;
            margin: 24px auto 0;
            padding-top: 24px;
            font-size: 12px;
            font-weight: 700;
            color: #A1A1A1;
          "
        >
          <p style="font-weight: 400;">
            You are receiving this email because you are subscribed for updates from <a style="color: #A1A1A1" href="https://${subdomain}.cent.co">${subdomain}.cent.co</a>, where ${appName || subdomain} regularly releases new work you can collect, trade, or sell.
            If you did not subscribe or no longer wish to receive these emails you can unsubscribe below.
          </p>
          <a
            style="
              padding: 8px 16px;
              color: #A1A1A1;
              text-decoration: none;
              font-size: 12px;
              font-weight: 400;
              margin-top: 16px;
              display: block;
            "
            href="${appProtocol}://${domain}/unsubscribe?{{UNSUB_KEY}}"
          >
            <span style="text-decoration: underline;">Unsubscribe</span> from ${subdomain}.cent.co
          </a>
        </div>
      </div>
    </div>`;
}

const EMAIL_COLUMN_HEADERS = [
  'email',
  'email address',
  'emailaddress',
  'email_address',
];

export const getEmailColumnHeader = (headers: string[]): string | null => {
  if (!headers) {
    return null;
  }
  const filtered = headers.filter((header) => EMAIL_COLUMN_HEADERS.indexOf(header.toLowerCase()) > -1);
  return filtered && filtered.length > 0 ? filtered[0] : null;
}

const VALID_EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export const validateAndNormalizeEmail = (email: string): string | false => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const formattedEmail = email.trim().toLowerCase();
  return formattedEmail.match(VALID_EMAIL_REGEX) ? formattedEmail : false;
};

export const WAITLIST_EMAIL_TEXT = 'Thank you for requesting access to a creator account on cent.co. We appreciate your patience while we\'re refining our offering and making sure it\'s ready for primetime. You\'ll receive another email from us once you\'ve been cleared to get started. Thanks for being a part of the Cent community!';

export const WAITLIST_EMAIL_BODY = `
  <div
    style="
      max-width: 600px;
      margin: 0 auto 32px;
      height: 100%;
      font-family: 'Helvetica';
      font-size: 18px;
    "
  >
    <div
      style="
        width: 100%;
        text-align: center;
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 16px;
      "
    >
      You've been added to the cent.co waitlist!
    </div>
    <p>
      Thank you for requesting access to cent.co.
      We appreciate your patience while we’re refining our offering and making sure it’s ready for primetime.
      To expedite approval for your account, please share with us a bit about yourself <a href="https://airtable.com/shryn3AuKJRnch6ZP" style="text-decoration: none;">here</a>.
    </p>
    <p>
      We’ll be approving accounts on a rolling basis—you’ll receive another email from us once you’ve been cleared to create your own cent.co page.
      In the meantime we hope you'll subscribe to some of our early adopters’ pages, which you can browse <a href="https://beta.cent.co/cent/appbio/+4fthaj" style="text-decoration: none;">here</a>.
    </p>
    <p>
      And please check out our own at <a href="https://cent.app.bio" style="text-decoration: none;">cent.app.bio</a>! Thanks for being a part of the Cent community.
    </p>
   </p>
  </div>`;


export const APPROVED_WAITLIST_EMAIL_TEXT = 'Thank you for your interest in setting up a page and using Cent\’s NFT-publishing and audience-management tools at cent.co. You have been moved off the waitlist and now have full access to a creator account. Visit cent.co and log in with this email address to start building your page and turning your work into digital collectibles with just a few clicks.';

export const APPROVED_WAITLIST_EMAIL_BODY = `
  <div
    style="
      max-width: 650px;
      margin: 0 auto 32px;
      height: 100%;
      font-family: 'Helvetica';
      font-size: 18px;
      line-height: 24px;
      text-align: center;
    "
  >
    <img
      src="https://beta.cent.co/img/type_logo_black@3x.png"
      style="
        max-width: 100%;
        width: 26px;
        margin: 24px auto;
      "
    />
    <div
      style="
        width: 100%;
        text-align: center;
        font-size: 24px;
        font-weight: 700;
        margin-top: 24px;
        margin-bottom: 24px;
      "
    >
      Congratulations!
    </div>
    <p>
      You've been approved to publish NFTs and share them with your audience using <a href="https://cent.co" style="color: #6c00ff;" >Cent Pages</a>! 🥳
    </p>
    <p>
      To get started, just go to <a href="https://cent.co" style="color: #6c00ff;" >cent.co</a> and <strong>log in with this email address</strong>. From there, you can build your page, collect subscribers, import your email list and launch your first NFT, with just a few clicks.
    </p>
    <p>
      <strong>Need help getting started?</strong> We have <a href="http://beta.cent.co/cent/appbio/" style="color: #6c00ff;" >some tips</a> on our blog, including a detailed overview on <a href="https://beta.cent.co/cent/+eze1u3" style="color: #6c00ff;" >how to set up your account</a>. 🔥🔥🔥
    </p>
    <div
      style="
        margin: 30px 0;
      "
    >
      <a
        style="
          display: inline-block;
          padding: 16px 28px;
          background-color: #6c00ff;
          border-radius: 50px;
          font-size: 16px;
          text-decoration: none;
          color: white;
          min-width: 30px;
        "
        href="http://cent.co"
      >
        Set up your account
      </a>
    </div>
    <img
      src="https://s3.amazonaws.com/cent-img-prod/60c7de5d-604c-4861-a439-58d42699a8ae.png"
      style="
        width: 100%;
        max-width: 100%;
        margin: 0 auto 34px;
      "
    />
  </div>`;

export const subscriptionText = (
  appProtocol: string,
  appHostname: string,
  name: string,
  subdomain: string,
): string => {
  const domain = `${subdomain}.${appHostname}`;
  return `${name} has added you to the https://${subdomain}.cent.co community. You will receive updates by email when ${name} releases new NFTs. If you do not wish to receive these emails you can unsubscribe here: ${appProtocol}://${domain}/unsubscribe?{{UNSUB_KEY}}.`;
}

export const subscriptionEmailBody = (
  appProtocol: string,
  appHostname: string,
  name: string,
  subdomain: string,
): string => {
  const domain = `${subdomain}.${appHostname}`;
  const displayName = name || subdomain;
  return `
    <div
      style="
        max-width: 600px;
        margin: 0 auto 32px;
        height: 100%;
        font-family: 'Helvetica';
        font-size: 18px;
      "
    >
      <div
        style="
          width: 100%;
          text-align: center;
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 16px;
        "
      >
        You have been subscribed to ${displayName} at ${subdomain}.cent.co
      </div>
      <p>
        ${displayName} has added you to the https://${subdomain}.cent.co community.
        You will receive updates by email when ${displayName} releases new work.
        If you do not wish to receive these emails you can <a href="${appProtocol}://${domain}/unsubscribe?{{UNSUB_KEY}}" style="text-decoration: none;">unsubscribe here</a>.
      </p>
    </div>`;
}

export const feedbackEmailBody = (
  feedback: string,
  name: string,
  subdomain: string,
  userEmail: string,
  appProtocol: string,
  appHostname: string,
): string => {
  const domain = `${subdomain}.${appHostname}`;
  const displayName = name || subdomain;
  return `
    <div
      style="
        margin: 0 auto 32px;
        height: 100%;
      "
    >
      <div
        style="
          width: 100%;
          text-align: center;
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 16px;
        "
      >
        Feedback from ${displayName}
      </div>
      <p>
        ${feedback}
      </p>
      <p>
        <div>
          <div>
            User Info:
          </div>
          <div>${userEmail}</div>
          <a href="${appProtocol}://${domain}">
            ${domain}
          </a>
        </div>
      </p>
    </div>`;
}

export const COLLECT_BUTTON_COLLECTED_EMAIL_TEXT = 'Your new NFT has been minted on the blockchain! You can view and manage your new digital collectible by signing into your Cent account.\n\nhttps://cent.co';

export const collectButtonCollectedEmailBody = (imageURI) => `
<div style="width: 100%; background-color: #eeeeee; text-align: center">
  <div
    style="
      max-width: 600px;
      margin: 0 auto 32px;
      height: 100%;
      font-family: 'Helvetica';
      font-size: 18px;
      line-height: 24px;
    "
  >
    <h1
      style="
        display: block;
        margin: 0;
        padding: 1em 0;
        color: #3d4043;
        font-family: 'Helvetica Neue',Helvetica,Arial,Verdana,sans-serif;
        font-size: 40px;
        font-style: normal;
        font-weight: normal;
        line-height: 150%;
        letter-spacing: normal;
      "
    >
      Congratulations! 🥳
    </h1>
    <img style="max-width: 100%; border-radius: 50px; margin: 9px auto" src=${imageURI} />
    <p style="color: #3d4043; font-size: 16px;">
      Your new NFT has been minted on the blockchain! You can view and manage your new digital collectible by signing into your Cent account.
    </p>
    <div
      style="
        margin: 30px 0;
      "
    >
      <a
        style="
          display: inline-block;
          padding: 16px 28px;
          background-color: transparent;
          border-radius: 50px;
          border: 2px solid black;
          font-size: 16px;
          text-decoration: none;
          color: black;
          min-width: 30px;
        "
        href="http://cent.co/account/collection"
      >
        Check out your NFT
      </a>
    </div>
    <img
      src="https://beta.cent.co/img/type_logo_black@3x.png"
      style="
        max-width: 100%;
        width: 22px;
        margin: 24px auto;
      "
    />
  </div>
</div>`;
