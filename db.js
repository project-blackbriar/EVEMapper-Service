const {MongoClient} = require("mongodb");

const client = new MongoClient(process.env.DBUrl, {useUnifiedTopology: true});

module.exports.Connect = (async () => {
    console.log('Connecting to Eve Tools Database');
    await client.connect();
    console.log('Satisfying Connection to Eve Tools Database');
    await client.db("evemaps").command({ping: 5});
    console.log('Successfully connected to Eve Tools Database');
});

module.exports.Database = () => client.db('evemaps');

module.exports.mongoDatabase = client;
