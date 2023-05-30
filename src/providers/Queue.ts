import kue from 'kue';

import Locals from './Locals';
import Log from '../middlewares/Log';

class Queue {
  public jobs: kue.Queue;

  constructor() {
    const envs = Locals.config();

    this.jobs = kue.createQueue({
      prefix: envs.redisQueuePrefix,

      redis: {
        port: envs.redisHttpPort,
        host: envs.redisHttpHost,
        auth: envs.redisPassword,
        db: envs.redisQueueDB
      }
    });

    this.jobs.setMaxListeners(1000);

    this.jobs
      .on('job enqueue', (_id, _type) => Log.info(`Queue :: #${_id} Processing of type '${_type}'`))
      .on('job complete', (_id) => this.removeProcessedJob(_id));
  }

  public process(_jobName: string, _maxConcurrent: number, _callback): void {
    this.jobs.process(_jobName, _maxConcurrent, async (_job, _done) => {
      try {
        console.log(`Queue :: ${_jobName} started!`);

        await _callback(_job.data);

        console.log(`Queue :: ${_jobName} complete!`);

        _done();
      }
      catch (err) {
        console.log(`Queue :: ${_jobName} failed with message: ${err.message}`);

        _done(err);
      }
    });
  }

  public create(_jobName: string, _attempts: number, _args: any): void {
    const job = this.jobs.create(_jobName, _args)
      .attempts(_attempts)
      .backoff({ delay: 5000, type: 'fixed' }) // Backoff in 5s
      .ttl(300_000)
      .save(); // TTL: 5m
    job.on('failed', () => this.removeProcessedJob(job.id));
  }

  public flush(): void {
    kue.Job.range(0, 100000, 'asc', (_err, _jobs) => {
      _jobs.forEach(_job => {
        // Cast `kue.Job as any` due to type error in `removeBadJob` type definition
        const mgr: any = kue.Job as any;
        mgr.removeBadJob(_job.id, _job.type);
      });
    });
  }

  private removeProcessedJob(_id): void {
    Log.info(`Queue :: #${_id} Processed`);

    kue.Job.get(_id, (_err, _job) => {
      if (_err) { return; }

      _job.remove((_err) => {
        if (_err) { throw _err; }

        Log.info(`Queue :: #${_id} Removed Processed Job`);
      });
    });
  }
}

export default new Queue;
