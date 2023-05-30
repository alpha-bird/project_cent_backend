# AIB-Backend

## Running Locally

### With Docker

#### Setup required stuffs
 - Docker(Install (and start) docker version 4.x+: https://www.docker.com/products/docker-desktop)
 - skeema(Install skeema: https://www.skeema.io/cli/download/ or `brew install skeema/tap/skeema`)

#### Follow below steps
1. Clone this repo
2. Install node modules: `npm install`
3. Copy .env.template into .env with `cp .env.template .env` and update it with testing credentials
4. Start up backend by docker: `npm run local:docker`
5. From the root of the repo, initialize the database: `npm run db:sync`

On subsequent startup, you only need to perform step 4. The backend should be available at [http://localhost:3500]

### Without Docker

#### Setup required stuffs
 - Node.js(Install Node.js here https://nodejs.org/en/)
 - MySQL 8(https://dev.mysql.com/downloads/mysql/)
 - skeema(Install skeema: https://www.skeema.io/cli/download/ or `brew install skeema/tap/skeema`)
 - redis(https://redis.io/topics/quickstart)

#### Follow below steps
1. Clone this repo
2. Install node modules: `npm install`
3. Copy .env.template into .env with `cp .env.template .env` and update it with testing credentials
4. From the root of the repo, initialize the database: `npm run db:sync`
5. Start up the backend without docker: `npm run local`

The backend should be available at [http://localhost:3500]

## Browsing the database

1. Install [Mysql community workbench](https://dev.mysql.com/downloads/workbench/)
2. In the UI, add a new connection with name: `aib`, port: `3307`, username: `root`, password: `xxx_root_password`, host: `127.0.0.1`.
3. Connect to the database! you can now run queries

## Modifying the database schema locally

The table structure lives in the `db` folder at the root of the repo. Each table has a SQL file. To add a new table, create a new `*.sql` with the definition. To modify an existing table, simply update its table definition in the existing file.

To update your local db with the changes, run `npm run db:sync` from the root of this repo.

## Stripe payments

1. Install the Stripe CLI
2. `stripe listen --forward-to localhost:3500/webhook/stripe`
3. Update the .env file with the webhook signing secret displayed in step 2

