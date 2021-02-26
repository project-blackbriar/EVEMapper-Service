const db = require('./../db');
const ObjectID = require('mongodb').ObjectID;
const maps = db.Database().collection('maps');
const eveService = require('./eveService');

module.exports = {
    async addPilotToMap(mapId, pilot) {
        await maps.updateOne({
            _id: ObjectID(mapId)
        }, {
            $push: {
                pilots: {
                    CharacterName: pilot.CharacterName,
                    system_id: pilot.location?.system_id,
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
            await this.addPilotToMap(pilot.map, pilot, location.solar_system_id);
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
        system = {
            ...system,
            creation_time: new Date()
        }
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
        system = {
            ...system,
            creation_time: new Date(system.creation_time)
        }
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
        const [there, back] = await Promise.all([
            maps.findOne({
                _id: ObjectID(mapId),
                connections: {
                    $elemMatch: {
                        'to': systemTo,
                        'from': systemFrom
                    }
                }
            }),
            maps.findOne({
                _id: ObjectID(mapId),
                connections: {
                    $elemMatch: {
                        'to': systemFrom,
                        'from': systemTo
                    }
                }
            })
        ]);
        if (there || back) {
            return null;
        } else {
            const newConnection = {
                from: systemFrom,
                to: systemTo,
                key: `${systemFrom}:${systemTo}`,
                size: "?",
                eol: false,
                status: 1,
                creation_time: new Date(),
                eol_time: null
            };
            await maps.updateOne({
                    _id: ObjectID(mapId),
                },
                {
                    $push: {
                        "connections": newConnection
                    }
                }
            );
            return newConnection;
        }
    },
    async updateConnectionInMap(mapId, connection) {
        try {
            connection = {
                ...connection,
                creation_time: new Date(connection.creation_time),
                eol_time: new Date(connection.eol_time)
            }
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
            console.warn("Failed updating connection in map. Map ID:", mapId, "Connection:", connection)
            console.warm(ex.message)
        }
    },
    async getConnections(mapId) {
        const data = await maps.findOne({
            _id: ObjectID(mapId)
        });
        return data.connections;
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
    },
    async deleteConnection(mapId, connection) {
        const updateFrom = await maps.updateOne({
            _id: ObjectID(mapId)
        }, {
            $pull: {
                'connections': {from: connection.from, to: connection.to}
            }
        });
    }
};
