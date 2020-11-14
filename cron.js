const cron = require('node-cron');
const db = require('./db');
const users = db.Database().collection('users');
const maps = db.Database().collection('maps');
const systems = db.Database().collection('systems');
const throttledQueue = require('throttled-queue');
const throttle = throttledQueue(1, 1000, true);
const axios = require('axios');
const qs = require('querystring');
const ObjectID = require('mongodb').ObjectID;
const EveService = require('./eveService');


const {io} = require('./main');

io.on('connection', (socket) => {
    console.log('Socket Connected');
    socket.on('map', (event) => {
        Object.keys(socket.rooms).forEach(room => {
            socket.leave(room);
        });
        socket.join(event.id);
    });
});


const eveService = new EveService();

const ESIAuth = axios.create({
    baseURL: 'https://login.eveonline.com'
});

const RefreshToken = async ({expires_in, access_token, refresh_token}) => {
    if (Date.now() < expires_in) {
        return access_token;
    }
    const response = await ESIAuth.post('/oauth/token', qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
    }), {
        auth: {
            username: process.env.EVE_CLIENT_ID,
            password: process.env.EVE_APP_SECRET
        },
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Host": 'login.eveonline.com'
        }
    });
    return response.data.access_token;
};

const updatePilotLocation = async (accessToken, pilot) => {
    if (pilot.map) {
        const onlineStatus = await eveService.getPilotStatus({token: accessToken, CharacterID: pilot.CharacterID});
        const location = await eveService.getPilotLocation({token: accessToken, CharacterID: pilot.CharacterID});
        const user = {
            online: onlineStatus.online,
            location: location
        };
        await users.updateOne({
            _id: ObjectID(pilot._id)
        }, {
            $set: user
        });
        if (pilot.location.solar_system_id !== user.location.solar_system_id) {
            const systemFrom = await systems.findOne({
                system_id: pilot.location.solar_system_id
            });
            const systemTo = await systems.findOne({
                system_id: user.location.solar_system_id
            });
            const systemFromUpdate = await maps.updateOne({
                _id: ObjectID(pilot.map),
                'locations.system_id': {$ne: systemFrom.system_id}
            }, {
                $push: {
                    'locations': {
                        ...systemFrom,
                        connections: [systemTo.system_id]
                    }
                }
            });
            if (systemFromUpdate.modifiedCount === 1) {
                io.to(pilot.map).emit('addLocation', {
                    system: {
                        ...systemFrom,
                        connections: [systemTo.system_id]
                    }
                });
            }
            const systemToUpdate = await maps.updateOne({
                _id: ObjectID(pilot.map),
                'locations.system_id': {$ne: systemTo.system_id}
            }, {
                $push: {
                    'locations': {
                        ...systemTo,
                        connections: [systemFrom.system_id]
                    }
                },
            });
            if (systemToUpdate.modifiedCount === 1) {
                io.to(pilot.map).emit('addLocation', {
                    system: {
                        ...systemTo,
                        connections: [systemFrom.system_id]
                    }
                });
            }
            io.to(pilot.map).emit('updatePilot', {
                name: pilot.CharacterName,
                from: systemFrom.system_id,
                to: systemTo.system_id
            });
            const removeUpdate = await maps.findOneAndUpdate({
                'locations.pilots': pilot.CharacterName
            }, {
                $pull: {
                    'locations.$.pilots': pilot.CharacterName,
                },
            });
            const addUpdate = await maps.findOneAndUpdate({
                'locations.system_id': parseInt(user.location.solar_system_id),
                'locations.pilots': {$ne: pilot.CharacterName}
            }, {
                $push: {
                    'locations.$.pilots': pilot.CharacterName
                }
            });
        }
    }
};

cron.schedule('*/5 * * * * *', async () => {
    const allUsers = await users.find({}).toArray();
    allUsers.map(async pilot => {
        throttle(async () => {
            const accessToken = await RefreshToken(pilot);
            await Promise.all([
                updatePilotLocation(accessToken, pilot)
            ]);
        });
    });
});
