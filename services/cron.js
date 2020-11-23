const cron = require('node-cron');
const db = require('../db');
const users = db.Database().collection('users');
const maps = db.Database().collection('maps');
const systems = db.Database().collection('systems');
const throttledQueue = require('throttled-queue');
const throttle = throttledQueue(30, 1000, true);
const axios = require('axios');
const qs = require('querystring');
const ObjectID = require('mongodb').ObjectID;
const EveService = require('./eveService');
const mapsService = require('./mapService');
const systemService = require('./systemService');
const ioService = require('./ioService');


const {io} = require('../main');

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

const updatePilotOnlineStatus = async (accessToken, pilot) => {
    const onlineStatus = await eveService.getPilotStatus({token: accessToken, CharacterID: pilot.CharacterID});
    const user = {
        onlineStatus
    };
    await users.updateOne({
        _id: ObjectID(pilot._id)
    }, {
        $set: user
    });
    //Pilot Online Status Changed
    if (!pilot.onlineStatus || pilot.onlineStatus?.online !== user.onlineStatus.online) {
        if (user.onlineStatus.online) {
            console.log(`Setting ${pilot.CharacterName} as Online`);
            await mapsService.addPilotToMap(pilot.map, pilot);
            await ioService.pilots.add(pilot.map, pilot);
        } else {
            console.log(`Setting ${pilot.CharacterName} as Offline`);
            await mapsService.removePilotFromMaps(pilot);
            await ioService.pilots.remove(pilot.map, pilot);
        }
    }
};

const updatePilotSystem = async (accessToken, pilot) => {
    const location = (await eveService.getPilotLocation({
        token: accessToken,
        CharacterID: pilot.CharacterID
    })) ?? {name: "Unknown", solar_system_id: -1};
    const user = {
        location
    };
    await users.updateOne({
        _id: ObjectID(pilot._id)
    }, {
        $set: user
    });

    //Pilot System has Changed
    if (pilot.location.solar_system_id !== user.location.solar_system_id) {
        await Promise.all([
                handleSystemChange(pilot, user.location),
                mapsService.setPilotLocationToMap(pilot, user.location),
                ioService.pilots.setLocation(pilot.map, pilot, user.location)
            ]
        );
    }
};


const handleSystemChange = async (pilot, locationTo) => {
    const [systemFrom, systemTo] = await Promise.all([
            systemService.getBySystemId(pilot.location.solar_system_id),
            systemService.getBySystemId(locationTo.solar_system_id)
        ]
    );
    const [mapSystemFrom, mapSystemTo, mapConnection] = await Promise.all([
        mapsService.addSystemToMap(pilot.map, systemFrom),
        mapsService.addSystemToMap(pilot.map, systemTo),
        mapsService.addConnectionToMap(pilot.map, systemFrom.system_id, systemTo.system_id)
    ]);
    await Promise.all([
        mapSystemFrom ? ioService.systems.add(pilot.map, systemFrom) : null,
        mapSystemTo ? ioService.systems.add(pilot.map, systemTo) : null,
        mapConnection ? ioService.connections.add(pilot.map, mapConnection) : null,
    ]);
};
/*
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
        /!* Encased in try block to handle pilot not having a location yet. *!/
        try {
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
            } else {
                /!* Check if pilot is in list for location, else add him to list *!/
                if (!await maps.findOne({
                    'locations.system_id': parseInt(user.location.solar_system_id),
                    'locations.pilots.name': pilot.CharacterName,
                })) {
                    await maps.updateOne({
                        'locations.system_id': parseInt(user.location.solar_system_id),
                    }, {
                        $addToSet: {
                            'locations.$.pilots': {
                                name: pilot.CharacterName,
                                ship: pilot.ship
                            }
                        }
                    });
                }
            }
        } catch (e) {
            if (e instanceof TypeError) {
                console.log('Pilot', pilot.CharacterName, 'has no location assigned. Skipping to wait for db update.');
            }
            console.log(e);
        }
    } else {
        /!* For dev: Add Test Map to user if user has no map. Future: add some default map to user. *!/
        console.log('User', pilot.CharacterName, 'has no map assigned. Assigning Test Map.');
        const map = await maps.findOne({name: 'Test Map'});
        const user = {
            map: map._id
        };
        await users.updateOne({
            _id: ObjectID(pilot._id)
        }, {
            $set: user
        });
    }
};*/

cron.schedule('*/5 * * * * *', async () => {
    const allUsers = await users.find({}).toArray();
    allUsers.map(async pilot => {
        throttle(async () => {
            const accessToken = await RefreshToken(pilot);
            await Promise.all([
                updatePilotSystem(accessToken, pilot),
                //updatePilotShip(accessToken, pilot)
            ]);
        });
    });
}, {});

cron.schedule('* * * * *', async () => {
    console.log('Running Online Status Checks');
    const allUsers = await users.find({}).toArray();
    allUsers.map(async pilot => {
        throttle(async () => {
            const accessToken = await RefreshToken(pilot);
            await Promise.all([
                updatePilotOnlineStatus(accessToken, pilot)
            ]);
        });
    });
}, {});
