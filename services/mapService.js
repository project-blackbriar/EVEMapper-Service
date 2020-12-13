const db = require('./../db');
const ObjectID = require('mongodb').ObjectID;
const maps = db.Database().collection('maps');

module.exports = {
    async addPilotToMap(mapId, pilot) {
        await maps.updateOne({
            _id: ObjectID(mapId)
        }, {
            $push: {
                pilots: {
                    CharacterName: pilot.CharacterName,
                    system_id: pilot.location.solar_system_id,
                    ship: pilot.ship
                }
            }
        });
    },
    async removePilotFromMaps(pilot) {
        await maps.updateMany({
            "pilots.CharacterName": pilot.CharacterName
        }, {
            $pull: {
                "pilots": {CharacterName: pilot.CharacterName}
            }
        });
    },
    async setPilotLocationToMap(pilot, location) {
        const {value: pilotOnMap} = await maps.findOneAndUpdate({
            'pilots.CharacterName': pilot.CharacterName
        }, {
            $set: {
                "pilots.$.system_id": location.solar_system_id
            }
        });
        if (!pilotOnMap) {
            await this.addPilotToMap(pilot.map, pilot,);
        }
    },
    async setPilotShipToMap(pilot, ship) {
        const {value: pilotOnMap} = await maps.findOneAndUpdate({
            'pilots.CharacterName': pilot.CharacterName
        }, {
            $set: {
                "pilots.$.ship": ship
            }
        });
    },
    async addSystemToMap(mapId, system) {
        const {value: map} = await maps.findOneAndUpdate({
            _id: ObjectID(mapId),
            "locations.system_id": {$ne: system.system_id}
        }, {
            $push: {
                'locations': system
            }
        });
        return map !== null;
    },
    async updateSystemInMap(mapId, system) {
        await maps.updateOne({
            _id: ObjectID(mapId),
            'locations.system_id': system.system_id,
        }, {
            $set: {
                'locations.$': system
            }
        });
    },
    async removeSystemFromMap(mapId, systemId) {
        await maps.updateOne({
            _id: ObjectID(mapId),
            "locations.system_id": parseInt(systemId)
        }, {
            $pull: {
                'locations': {system_id: parseInt(systemId)}
            }
        });
    },
    async addConnectionToMap(mapId, systemFrom, systemTo) {
        const newConnection = {
            from: systemFrom,
            to: systemTo,
            size: "?",
            eol: false,
            status: 1
        };
        const insert = await maps.findOneAndUpdate({
                _id: ObjectID(mapId),
                $or: [
                    {'connections.from': {$ne: systemFrom}},
                    {'connections.to': {$ne: systemTo}}
                ]
            },
            {
                $push: {
                    "connections": newConnection
                }
            }
        );
        console.log(insert.value);
        console.log(insert.modifiedCount);
        console.log(insert.matchedCount);
        return insert.value !== null ? newConnection : null;
    },
    async updateConnectionInMap(mapId, connection) {
        try {
            await maps.updateOne({
                _id: ObjectID(mapId),
                'connections.from': connection.from,
                'connections.to': connection.to
            }, {
                $set: {
                    'connections.$': connection
                }
            });
        } catch (ex) {

        }
    },
    async removeConnectionsForSystem(mapId, system_id) {
        const intId = parseInt(system_id);
        const updateFrom = await maps.updateMany({
            _id: ObjectID(mapId),
            $or: [{'connections.from': intId}, {'connections.to': intId}]
        }, {
            $pull: {
                'connections': {$or: [{from: intId}, {to: intId}]}
            }
        });
    }
};
