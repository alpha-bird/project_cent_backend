import React from 'react';
import ReactDOMServer from 'react-dom/server';

import Content from './content';

class HTML extends React.Component {

  render() {
    var data = this.props.data;

    // render the content as a dynamic react component
    var contentHtml = ReactDOMServer.renderToString(<Content {...data} />);

    /**
     * re-render the content as json,
     * for client-side app initialization
     *
     * NOTE on XSS prevention:
     *
     * This text will be placed into a script tag.
     * It cannot be escaped,
     * because it is intended to be raw javascript.
     * Were the data object to contain the string, "</script>",
     * the script tag would terminate prematurely.
     * And two bad things would happen.
     *
     *    1. The client-side react application would not work.
     *    2. A second script tag could then run arbitrary javascript.
     *
     * The former sucks a little but the latter sucks a lot.
     * It would pwn you, game over, the site is no longer yours.
     * There are three ways to thwart this scenario and you should do all of them:
     *
     *    1. Scrub input from users.
     *       Don't even let them enter data that is known to be potentially harmful.
     *    2. Use a templating library that renders text by default.
     *       React does this, so YES!
     *    3. Whenever you have to write raw user content into the document,
     *       block any content from breaking the current context.
     *
     * The third is what's going on with the `replace` function below.
     * Because we're in a script tag context,
     * we cannot allow the closing tag, "</script>", in our output.
     * This is an old trick that breaks up the word "script" into a string contatenation.
     * It works here because json always uses double quotes to escape strings.
     *
     * Properly escaping user data for raw output in html is tricky business.
     * Whenever possible, avoid it.
     * If avoidance is impossible,
     * know what you are doing and good luck.
     */
    const initScript = 'renderApp(' + JSON.stringify(data).replace(/script/g, 'script') + ')';

    return (
      <html lang="en">
        <head>
          <title>AIB Service</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />

          <link type="image/x-icon" rel="shortcut icon" href="/public/favicon.ico" />
          <link rel="apple-touch-icon" sizes="180x180" href="/public/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/public/favicon-16x16.png" />
          <link rel="manifest" href="/public/site.webmanifest" />

          <script src="/public/bundle.js" type="text/javascript" />
        </head>

        <body>
          <div id="root" dangerouslySetInnerHTML={{__html: contentHtml}} />

          <script dangerouslySetInnerHTML={{__html: initScript}} />
        </body>
      </html>
    );
  }
}

export default HTML;
