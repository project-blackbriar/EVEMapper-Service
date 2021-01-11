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
const eveService = require('./eveService');
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


const ESIAuth = axios.create({
    baseURL: 'https://login.eveonline.com'
});

const RefreshToken = async (pilot) => {
    if (Date.now() < pilot.expires_in) {
        return pilot.access_token;
    }
    let response
    try {
        response = await ESIAuth.post('/oauth/token', qs.stringify({
            grant_type: 'refresh_token',
            refresh_token: pilot.refresh_token
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
    } catch (err) {
        console.error("Failed refreshing token.", err.message)
        // Set user as offline
        pilot.onlineStatus = {
            ...pilot.onlineStatus,
            online: false
        }
        pilot.refresh_token = "-1"
        await users.updateOne({
            _id: ObjectID(pilot._id)
        }, {
            $set: pilot
        });
        return -1
    }
    return response.data.access_token;
};

const updatePilotShip = async (accessToken, pilot) => {
    const ship = await eveService.getPilotShip({token: accessToken, CharacterID: pilot.CharacterID});
    if (ship) {
        const user = {
            ship
        };
        //Pilot Ship has Changed
        if (!pilot.ship || user.ship.ship_item_id !== pilot.ship.ship_item_id) {
            const type = await eveService.getType(ship.ship_type_id);
            // Check for unicode escape in ship name and unescape if necessary
            if (user.ship.ship_name.substring(0, 2) == 'u\'') {
                user.ship.ship_name = JSON.parse('"' + user.ship.ship_name.substr(2, user.ship.ship_name.length - 3) + '"')
            }
            user.ship = {
                ...user.ship,
                type: type.name
            };
            await users.updateOne({
                _id: ObjectID(pilot._id)
            }, {
                $set: user
            });
            await Promise.all([
                mapsService.setPilotShipToMap(pilot, user.ship),
                ioService.pilots.setShip(pilot.map, pilot, user.ship)
            ]);
        }
    }
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
    //Pilot Online Status Changed ; cannot read property 'online' of null
    try {
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
    } catch (err) {
        console.error('Error while updating pilot online status:', err.message)
        console.error('user.onlineStatus = ', user.onlineStatus)
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

    if (!pilot.location) {
        await Promise.all([
                mapsService.setPilotLocationToMap(pilot, user.location),
                ioService.pilots.setLocation(pilot.map, pilot, user.location)
            ]
        );
    }

    //Pilot System has Changed
    if (pilot.location && pilot.location.solar_system_id !== user.location.solar_system_id) {
        await handleSystemChange(pilot, user.location);
        await Promise.all([
                mapsService.setPilotLocationToMap(pilot, user.location),
                ioService.pilots.setLocation(pilot.map, pilot, user.location)
            ]
        );

        await users.updateOne({
            _id: ObjectID(pilot._id)
        }, {
            $set: user
        });
    }
};


const handleSystemChange = async (pilot, locationTo) => {
    const [systemFrom, systemTo] = await Promise.all([
            systemService.getBySystemId(pilot.location.solar_system_id),
            systemService.getBySystemId(locationTo.solar_system_id)
        ]
    );
    // Getting 'cannot read system_id of null', so added a truthiness check
    if (!systemFrom || !systemTo) {
        console.log('SystemFrom or SystemTo is null. Why?')
        console.log(systemFrom ? "systemFrom exists" : "systemFrom no exists")
        console.log(systemTo ? "systemTo exists" : "systemTo no exists")
    }
    if (systemFrom.type === 'J' ||
        systemTo.type === 'J') {
            // Adding offset from origin system
            const map = await maps.findOne({
                _id: pilot.map
            })
            let locationFrom
            if (map){
                locationFrom = map.locations.find(loc => loc.system_id == pilot.location.solar_system_id)
            }
            if (systemTo && locationFrom){
                systemTo.top = locationFrom.top + 100
                systemTo.left = locationFrom.left + 20
            }
        const [mapSystemFrom, mapSystemTo, mapConnection] = await Promise.all([
            systemFrom ? mapsService.addSystemToMap(pilot.map, systemFrom) : null,
            mapsService.addSystemToMap(pilot.map, systemTo),
            mapsService.addConnectionToMap(pilot.map, systemFrom.system_id, systemTo.system_id)
        ]);
        await Promise.all([
            mapSystemFrom ? ioService.systems.add(pilot.map, systemFrom) : null,
            mapSystemTo ? ioService.systems.add(pilot.map, systemTo) : null,
            mapConnection ? ioService.connections.add(pilot.map, mapConnection) : null,
        ]);
    }
};

cron.schedule('*/5 * * * * *', async () => {
    if (await eveService.getHealth()) {
        const allUsers = await users.find({
            'onlineStatus.online': true
        }).toArray();
        allUsers.map(async pilot => {
            throttle(async () => {
                const accessToken = await RefreshToken(pilot);
                if (accessToken === -1) { // Check token validity
                    console.warn(`Error when checking ship and location. Token for ${pilot.CharacterName} is invalid.`)
                } else {
                    await Promise.all([
                        updatePilotSystem(accessToken, pilot),
                        updatePilotShip(accessToken, pilot)
                    ]);
                }
            });
        });
    } else {
        console.log('EVE is Offline');
    }
}, {});

cron.schedule('*/30 * * * * *', async () => {
    if (await eveService.getHealth()) {
        //console.log('Running Online Status Checks');
        const allUsers = await users.find({}).toArray();
        allUsers.map(async pilot => {
            throttle(async () => {
                const accessToken = await RefreshToken(pilot);
                if (accessToken === -1) { // Check token validity
                    console.warn(`Error at Online status check. Token for ${pilot.CharacterName} is invalid.`);
                } else {
                    await Promise.all([
                        updatePilotOnlineStatus(accessToken, pilot)
                    ]);
                }
            });
        });
    } else {
        console.log('EVE is Offline');
    }
}, {});
