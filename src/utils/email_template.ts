export const dailyDigestEmailBody = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    </head>
    <body style="height: 100%;width: 100%;margin: 0;padding: 0;background-color: #eeeeee;font-family: Helvetica">
      <center>
        <table id="bodyTable" align="center" width="100%" height="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse;height: 100%;margin: 0;padding: 0;width: 100%;background-color: #eeeeee2;font-family: 'Helvetica Neue', Helvetica, Arial, Verdana, sans-serif;">
          <tbody>
            <tr>
              <td id="bodyCell" align="center" valign="top" style="background-color: #eeeeee;padding: 64px 16px 16px;">
                <table id="templateTable" width="100%" height="100%" style="border-collapse: collapse;border: 1px none;max-width: 600px !important;">
                  <tbody>
                    <tr>
                      <td align="center" id="templateHeader">
                        <table width="100%">
                          <tbody>
                            <tr>
                              <td align="center">
                                <a
                                  href="{{APP_PROTOCOL}}://{{DOMAIN}}/account/inbox"
                                  target="__blank"
                                >
                                  <img src="https://beta.cent.co/img/type_logo_black@3x.png" style="width: 100%;max-width: 23px;height: auto;" />
                                </a>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 16px;">
                            </tr>
                            <tr>
                              <td style="text-align: center;">
                                <h1 style="font-size: 48px;font-weight: normal;margin: 16px 0;color: #3d4043;">Cent Daily Digest</h1>
                                <p style="color: #3d4043;font-size: 18px;line-height: 150%;">Your daily recap of releases for October 17, 2022</p>
                              </td>
                            </tr>
                          </tbody>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 16px;" />
                    </tr>
                    <tr>
                      <td id="templateBody" align="center" style="background-color: #eeeeee;">
                        <table width="100%" height="100%" style="border-collapse: collapse;">
                          <tbody style="border-bottom: 2px dotted #3d4043;">
                            <tr>
                              <td>
                                <table id="releaseTable" width="100%;" cellspacing="16px" style="padding-bottom: 64px;">
                                  <tbody>
                                    <tr style="display: {{POST_IMAGE_DISPLAY}}">
                                      <td align="center">
                                        <table>
                                          <tbody>
                                            <tr>
                                              <td>
                                                <img src="{{POST_IMAGE}}" style="width: 100%;max-width: 480px; height: auto; border-radius: 12px;margin-bottom: 16px;"/>
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center" style="color: #3d4043; font-size: 18px;">
                                        {{POST_TITLE}} by
                                        <a href="{{PAGE_URL}}" style="color: #3d4043;cursor: pointer;text-decoration: underline;">
                                          {{CREATOR_NAME}}
                                        </a>
                                        <div align="center" style="display: {{POST_MORE_DISPLAY}}">
                                          {{POST_MORE_TEXT}}
                                        </div>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center" style="padding: 16px 0 32px;">
                                        <table>
                                          <tbody>
                                            <tr>
                                              <td align="center" style="background-color: #6C00FF;color: white;border-radius: 40px;">
                                                <a href="{{PAGE_URL}}" style="font-size: 18px;color: white;text-decoration: none;padding: 24px;display: block;">
                                                  Collect this release
                                                </a>
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <table id="releaseTable" width="100%;" cellspacing="16px" style="padding-bottom: 64px;display: {{POST_DISPLAY_TWO}};">
                                  <tbody>
                                    <tr style="display: {{POST_IMAGE_DISPLAY_TWO}}">
                                      <td align="center">
                                        <table>
                                          <tbody>
                                            <tr>
                                              <td>
                                                <img src="{{POST_IMAGE_TWO}}" style="width: 100%;max-width: 480px; height: auto;border-radius: 12px;margin-bottom: 16px;"/>
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center" style="color: #3d4043; font-size: 18px; line-height: 150%;">
                                        {{POST_TITLE_TWO}} by
                                        <a href="{{PAGE_URL_TWO}}" style="color: #3d4043;cursor: pointer;text-decoration: underline;">
                                          {{CREATOR_NAME_TWO}}
                                        </a>
                                        <div align="center" style="display: {{POST_MORE_DISPLAY_TWO}}">
                                          {{POST_MORE_TEXT_TWO}}
                                        </div>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center" style="padding: 16px 0 32px;">
                                        <table>
                                          <tbody>
                                            <tr>
                                              <td align="center" style="background-color: #6C00FF;color: white;border-radius: 40px;">
                                                <a href="{{PAGE_URL_TWO}}" style="font-size: 18px;color: white;text-decoration: none;padding: 24px;display: block;">
                                                  Collect this release
                                                </a>
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <table id="releaseTable" width="100%;" cellspacing="16px" style="display: {{POST_DISPLAY_THREE}};padding-bottom: 64px;">
                                  <tbody>
                                    <tr style="display: {{POST_IMAGE_DISPLAY_THREE}}">
                                      <td align="center">
                                        <table>
                                          <tbody>
                                            <tr>
                                              <td>
                                                <img src="{{POST_IMAGE_THREE}}" style="width: 100%;max-width: 480px; height: auto;border-radius: 12px;margin-bottom: 16px;"/>
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center" style="color: #3d4043; font-size: 18px; line-height: 150%;">
                                        {{POST_TITLE_THREE}} by
                                        <a href="{{PAGE_URL_THREE}}" style="color: #3d4043;cursor: pointer;text-decoration: underline;">
                                          {{CREATOR_NAME_THREE}}
                                        </a>
                                        <div align="center" style="display: {{POST_MORE_DISPLAY_THREE}}">
                                          {{POST_MORE_TEXT_THREE}}
                                        </div>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center" style="padding: 16px 0 32px;">
                                        <table>
                                          <tbody>
                                            <tr>
                                              <td align="center" style="background-color: #6C00FF;color: white;border-radius: 40px;">
                                                <a href="{{PAGE_URL_THREE}}" style="font-size: 18px;color: white;text-decoration: none;padding: 24px;display: block;">
                                                  Collect this release
                                                </a>
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                          <tbody style="border-bottom: 2px dotted #3d4043;">
                            <tr style="display: {{MORE_RELEASES_DISPLAY}}">
                              <td>
                                <table id="moreReleasesTable" width="100%" style="padding: 64px 0 32px;">
                                  <tbody>
                                    <tr>
                                      <td align="center" style="color: #3d4043;font-size: 36px;font-weight: normal;line-height: 125%;padding-bottom: 16px;">
                                        More releases
                                      </td>
                                    </tr>
                                    <tr>
                                      <td id="linkCell" style="font-size: 18px;color: #3d4043;">
                                        View all new releases from the creators you are subscribed to in your inbox.
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center" style="padding: 16px 0;">
                                        <table>
                                          <tbody>
                                            <tr>
                                              <td align="center" style="padding: 24px;background-color: #6C00FF;color: white;border-radius: 40px;">
                                                <a
                                                  href="{{APP_PROTOCOL}}://{{DOMAIN}}/account/inbox"
                                                  target="__blank"
                                                  style="font-size: 18px;color: white;text-decoration: none;"
                                                >
                                                  View inbox
                                                </a>
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                          <tbody>
                            <tr>
                              <td>
                                <table id="footerTable" width="100%" cellspacing="16px" style="padding: 48px 0;">
                                  <tbody>
                                    <tr>
                                      <td align="center">
                                        <h1 style="color: #3d4043;font-size: 48px;font-weight: normal;text-transform: uppercase;margin: 16px 0;">CENT</h1>
                                        <p style="color: #3d4043;font-size: 18px;">Our mission is to enable anyone to make a creative income.</p>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="center">
                                        <a href="https://twitter.com/Cent" target="__blank" style="text-decoration: none;padding: 8px 16px;">
                                          <img src="https://cdn-images.mailchimp.com/icons/social-block-v2/light-twitter-48.png" style="width: 24px;height: 24px;" />
                                        </a>
                                        <a href="https://www.instagram.com/cent_inc/" target="__blank" style="text-decoration: none;padding: 8px 16px;">
                                          <img src="https://cdn-images.mailchimp.com/icons/social-block-v2/light-instagram-48.png" style="width: 24px;height: 24px;" />
                                        </a>
                                        <a href="https://www.facebook.com/centinc" target="__blank" style="text-decoration: none;padding: 8px 16px;">
                                          <img src="https://cdn-images.mailchimp.com/icons/social-block-v2/light-facebook-48.png" style="width: 24px;height: 24px;" />
                                        </a>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td style="font-size: 12px;text-align: center;line-height: 150%;word-break: break-word;color: #656565;">
                                Copyright © 2022 CENT, All rights reserved.<br />
                                You are receiving this email because you opted in via our website.<br />
                                <br />
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
                                  href="{{APP_PROTOCOL}}://{{DOMAIN}}/unsubscribe?{{UNSUB_KEY}}"
                                >
                                  <span style="text-decoration: underline;">Unsubscribe</span> here.
                                </a>
                                <br />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </center>
    </body>
  </html>
`;
