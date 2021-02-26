# EVEMapper-Service: backend server for Artemis
[Artemis Mapper for EVE Online](https://github.com/project-blackbriar/EVEMapper)

Requires [Node.js](https://nodejs.org/en/download/) for installation and building.
Requires [MongoDB](https://docs.mongodb.com/manual/installation/)

## ESI App setup
Follow the guide [here](https://github.com/project-blackbriar/EVEMapper/blob/master/README.md) for creating an ESI app for your mapper. Both the mapper frontend and the backend service must use the same app ID.

## 

## Database
Install and run MongoDB on your machine. It should work out of the box with the default configuration.

IMPORTANT NOTE: The default configuration does not use authentication. This may be ok for a development environment where Mongo only accepts connections from local machine, but PLEASE consider using authentication always. Users' ESI tokens are stored there...

You need to pre-load the database with solar systems and wormhole statics. Use [EVEMapper-Utility](https://github.com/project-blackbriar/EVEMapper-Utility) for this.

## .env
Copy `dotenv-example` file to `.env` and edit to fill in your ESI app ID and Secret Key. `DBUrl` and `API_URL` defaults are configured for a local development environment. Change `DBUrl` to use your credentials, because you enabled authentication in Mongo, right? RIGHT!?

`API_URL` is the address where your backend will be running. It should be the same as in the `.env` file of the frontend app.

`DISCORD_WEBHOOK_URL` is for an unimplemented feature, don't worry about it for now.
```
cp dotenv-example .env
nano .env
```
## Development setup
For local development, you should only need to install Node packages and run the backed using `nodemon` for auto-reload.
```
npm install
nodemon main.js
```
## Production deployment
For production, we'll need to install Node packages and run the app under a supervisor. [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/) works great for this.
```
npm install
pm2 start main.js --name "artemis-backend"
```
