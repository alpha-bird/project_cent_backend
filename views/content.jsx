import React from 'react';

import ErrorPage from './error';
import NotFoundPage from './not_found';

class Content extends React.Component {
  render() {
    const _route = this.props._route;
    const _content = this.props._content;

    switch(_route) {
    case 'error':
      return <ErrorPage />
    case 'notFound':
      return <NotFoundPage />
    default:
      return (
        <div id='content'>{_content}</div>
      )
    }
  }
}

export default Content;
