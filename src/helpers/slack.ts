import axios from 'axios';

/*
  Post a slack message to a specific channel in Cent org
  the url that gets passed in will determine which channel the message gets posted to
  each channel will have a specific webhook url defined as an env variable
*/
export const postSlackMessage = (url: string, message: string): void => {
  axios.post(url, {
    text: message,
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  }).catch(error => {
    console.log('Error: Posting slack message:');
    console.log(error);
  });
};
