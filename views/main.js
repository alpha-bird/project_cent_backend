import React from 'react';
import ReactDOM from 'react-dom';
import Content from './content';

function main(data) {
  ReactDOM.hydrate(<Content {...data} />, document.getElementById('root'));
};

window.renderApp = function(data) {
  main(data);
}

export default main;
