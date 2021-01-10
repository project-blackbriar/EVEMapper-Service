const express = require('express');
const bodyParser = require("body-parser");
const cors = require("cors");
require('dotenv').config();
const app = express();
const db = require('./db');
const ObjectID = require('mongodb').ObjectID;
const http = require('http').createServer(app);
const io = require('socket.io')(http);

module.exports.io = io;

// Performance monitoring - for DEV
app.use(require('express-status-monitor')());

app.use(cors({origin: true, credentials: true}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get("/health", (req, res) => {
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
console.log('Booting Service and Database');

db.Connect().then(_ => {
    app.use('/auth', require('./routes/auth'));
    app.use('/maps', require('./routes/maps'));
    app.use('/users', require('./routes/users'));
    app.use('/systems', require('./routes/systems'));
    app.emit('ready');
    require('./services/cron');
});

const maps = db.Database().collection('maps');
const IsAuth = require('./middleware/auth');
app.get('/test', IsAuth, async (req, res) => {
    res.sendStatus(200);
});

app.on('ready', function () {
    http.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}.`);
    });
});
