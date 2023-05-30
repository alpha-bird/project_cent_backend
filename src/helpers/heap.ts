import axios from 'axios';
import { APP_ENV } from '../interface/app';

export class Heap {

  public envs: AIB.IEnvironment;

  constructor (envs: AIB.IEnvironment) {
    this.envs = envs;
  }

  public track(event: string, identity?: string, properties?: any): void {
    if (this.envs.appEnv == APP_ENV.PROD) {
      axios.post('https://heapanalytics.com/api/track', {
        app_id: this.envs.heapAppID,
        identity,
        event,
        timestamp: new Date().toISOString(),
        properties
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => console.log(response.data))
      .catch((error) => {
        if (error.response) {
          console.error('Heap track failed', error.response.data);
        }
        else {
          console.log('Heap track failed', error.message);
        }
      });
    }
  }
}

export default Heap;