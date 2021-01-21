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
            try {
                if (user.ship.ship_name.substring(0, 2) == 'u\'') {
                    user.ship.ship_name = JSON.parse('"' + user.ship.ship_name.substr(2, user.ship.ship_name.length - 3) + '"')
                }
            } catch (err) {
                console.error(err.message, user.ship.ship_name)
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
    if (!onlineStatus) {
        return
    }
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
    }));

    if (location.solar_system_id === -1) {
        console.warn('Failed getting user location. Skipping until next update')
        return
    }

    const user = {
        location
    };

    await users.updateOne({
        _id: ObjectID(pilot._id)
    }, {
        $set: user
    });
    const userNotOnMap = await maps.findOne({
        _id: ObjectID(pilot.map),
        pilots: {
            $elemMatch: {
                'CharacterName': pilot.CharacterName,
                'system_id': null
            }
        }
    })
    if (userNotOnMap){
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
    if (systemFrom.type === 'J' ||
    systemTo.type === 'J') {
        // Add locations to map
        const [mapSystemFrom, mapSystemTo, mapConnection] = await Promise.all([
            systemFrom ? mapsService.addSystemToMap(pilot.map, systemFrom) : null,
            mapsService.addSystemToMap(pilot.map, systemTo),
            mapsService.addConnectionToMap(pilot.map, systemFrom.system_id, systemTo.system_id)
        ]);
        if (mapSystemTo) { // If locationTo was added to the map
            // Find details for origin location
            const map = await maps.findOne({
                _id: ObjectID(pilot.map)
            }) 
            const locationFrom = map.locations.find(loc => loc.system_id == pilot.location.solar_system_id)
            // Adding offset from origin system
            if (systemTo && locationFrom){
                systemTo.top = locationFrom.top + 100
                systemTo.left = locationFrom.left + 20
            }
            // Adding calculated alias
            if (systemTo.type === 'J') { // But only for WHs
                const name = await calculateName(pilot.map, systemTo.system_id)
                systemTo.alias = name
            }
            await mapsService.updateSystemInMap(pilot.map, systemTo)
        }
        await Promise.all([
            mapSystemFrom ? ioService.systems.add(pilot.map, systemFrom) : null,
            mapSystemTo ? ioService.systems.add(pilot.map, systemTo) : null,
            mapConnection ? ioService.connections.add(pilot.map, mapConnection) : null,
        ]);
    }
};

const calculateName = async (mapID, system_id) => {
    const map = await maps.findOne({
        _id: ObjectID(mapID)
    })
    if (!map) {return}
    var Q = []
    var count = 0
    var seq = []
    const locations = [...map.locations]
    const connections = [...map.connections]
    const origin = locations.find(l => l.system_id === system_id)
    if (!origin) {
        console.log('Location not found on map while calculating alias.')
        return
    }
    if (origin.name === "J160941") {
        return
    }
    Q.push(origin)
    Q[0].searched = true
    while (Q.length > 0) {
        const point = Q.shift()
        if (point.security === origin.security) {
            count ++
            if (point.alias){
                seq.push(point.alias.substr(2,2))
                seq.sort()
            }
        }
        for (const id of findConnected(point.system_id, connections)) {
            const node = locations.find(l => l.system_id === id)
            if (node.name === "J160941") {
                continue
            }
            if (!node.searched) {
                node.searched = true
                Q.push(node)
            }
        }
    }
    const name = origin.security + findMissingChar(seq)
    console.log('Found', count, 'systems with class', origin.security)
    console.log('Suggested name for', origin.name, 'is:', name)
    return name
};

const findConnected = (systemID, connections) => {
    let connected = []
    for (const connection of connections) {
        if (connection.from === systemID) {
            connected.push(connection.to)
        }
        if (connection.to === systemID) {
            connected.push(connection.from)
        }
    }
    return connected
}

const findMissingChar = (sequence) => {
    const seq = sequence.join('')
    for (let i = 65; i < 91; i++) {
        if (seq.includes(String.fromCharCode(i))) {
            continue
        }
        return String.fromCharCode(i)
    }
    return false
}

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
