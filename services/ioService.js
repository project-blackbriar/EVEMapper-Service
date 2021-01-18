const {io} = require('./../main');

module.exports = {
    systems: {
        async add(mapId, system) {
            await io.to(mapId).emit('addSystem', system);
        },
        async remove(mapId, systemId) {
            await io.to(mapId).emit('removeSystem', systemId);
        },
        async update(mapId, system) {
            await io.to(mapId).emit('updateSystem', system);
        }
    },
    connections: {
        async add(mapId, connection) {
            await io.to(mapId).emit('addConnection', connection);
        },
        async remove(mapId, connection) {
            await io.to(mapId).emit('removeConnection', connection);
        },
        async delink(mapId, system_id) {
            await io.to(mapId).emit('delinkSystem', system_id);
        },
        async update(mapId, connection) {
            await io.to(mapId).emit('updateConnection', connection);
        }
    },
    pilots: {
        async add(mapId, pilot) {
            await io.to(mapId).emit('addPilot', {
                CharacterName: pilot.CharacterName,
                system_id: pilot.location?.solar_system_id,
                ship: pilot.ship
            });
        },
        async remove(mapId, pilot) {
            await io.to(mapId).emit('removePilot', pilot.CharacterName);
        },
        async setLocation(mapId, pilot, location) {
            await io.to(mapId).emit('setPilotLocation', {
                name: pilot.CharacterName, system_id: location.solar_system_id
            });
        },
        async setShip(mapId, pilot, ship) {
            await io.to(mapId).emit('setPilotShip', {
                name: pilot.CharacterName, ship
            });
        }
    }
};
