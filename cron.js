const cron = require('node-cron');
const db = require('./db');
const users = db.Database().collection('users');
const maps = db.Database().collection('maps');
const systems = db.Database().collection('systems');
const throttledQueue = require('throttled-queue');
const throttle = throttledQueue(30, 1000, true);
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

const updatePilotShip = async (accessToken, pilot) => {
    const ship = await eveService.getPilotShip({token: accessToken, CharacterID: pilot.CharacterID});
    const shipType = await eveService.getType(ship.ship_type_id);
    const user = {
        ship: {
            name: ship.ship_name,
            type: shipType.name
        }
    };
    if (pilot.ship.name !== user.ship.name || pilot.ship.type !== user.ship.type) {
        await users.updateOne({
            _id: ObjectID(pilot._id)
        }, {
            $set: user
        });
        const doc = {
            name: pilot.CharacterName,
            ship: user.ship
        };
        io.to(pilot.map).emit('updatePilotShip', doc);

        await maps.updateOne({
            'locations.system_id': parseInt(pilot.location.solar_system_id),
            'locations.pilots': {$ne: pilot.CharacterName}
        }, {
            $set: {
                'locations.$[location].pilots.$[pilot]': doc
            }
        }, {
            arrayFilters: [{'location.system_id': pilot.location.solar_system_id}, {'pilot.name': pilot.CharacterName}]
        });
    }
};

const updatePilotLocation = async (accessToken, pilot) => {
    if (pilot.map) {
        const onlineStatus = await eveService.getPilotStatus({token: accessToken, CharacterID: pilot.CharacterID});
        const location = await eveService.getPilotLocation({token: accessToken, CharacterID: pilot.CharacterID});
        const user = {
            online: onlineStatus.online,
            location: location,
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
                        connections: [systemTo.system_id],
                        pilots: []
                    }
                }
            });
            if (systemFromUpdate.modifiedCount === 1) {
                io.to(pilot.map).emit('addLocation', {
                    system: {
                        ...systemFrom,
                        connections: [systemTo.system_id],
                        pilots: []
                    }
                });
            } else {
                await maps.findOneAndUpdate({
                    _id: ObjectID(pilot.map)
                }, {
                    $pull: {
                        'locations.$[location].pilots': {'name': pilot.CharacterName},
                    },
                }, {
                    arrayFilters: [{'location.system_id': systemFrom.system_id}]
                });
                io.to(pilot.map).emit('removePilot', {
                    from: systemFrom.system_id,
                    pilot: {
                        name: pilot.CharacterName,
                        ship: pilot.ship
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
                        connections: [systemFrom.system_id],
                        pilots: [{
                            name: pilot.CharacterName,
                            ship: pilot.ship
                        }]
                    }
                },
            });
            if (systemToUpdate.modifiedCount === 1) {
                io.to(pilot.map).emit('addLocation', {
                    system: {
                        ...systemTo,
                        connections: [systemFrom.system_id],
                        pilots: [{
                            name: pilot.CharacterName,
                            ship: pilot.ship
                        }]
                    }
                });
            } else {
                await maps.updateOne({
                    'locations.system_id': parseInt(user.location.solar_system_id)
                }, {
                    $push: {
                        'locations.$.pilots': {
                            name: pilot.CharacterName,
                            ship: pilot.ship
                        }
                    }
                });
                io.to(pilot.map).emit('addPilot', {
                    to: systemTo.system_id,
                    pilot: {
                        name: pilot.CharacterName,
                        ship: pilot.ship
                    }
                });
            }

        }
    }
};

cron.schedule('*/5 * * * * *', async () => {
    const allUsers = await users.find({}).toArray();
    allUsers.map(async pilot => {
        throttle(async () => {
            const accessToken = await RefreshToken(pilot);
            await Promise.all([
                updatePilotLocation(accessToken, pilot),
                updatePilotShip(accessToken, pilot)
            ]);
        });
    });
});
