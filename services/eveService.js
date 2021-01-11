const axios = require('axios');

const eveUrl = 'https://esi.evetech.net/latest/';
const ESI = axios.create({
    baseURL: eveUrl
});

module.exports = {
    async getHealth() {
        try {
            const response = await ESI.get(`/status`);
            if (response.status === 200) {
                return true;
            }
        } catch (ex) {
            console.error("Error getting ESI health.", ex.message)
            return false;
        }
    },

    async getUniverseIds(names) {
        const response = await ESI.post(`universe/ids/`, names);
        return response.data;
    },

    async getUniverseNames(ids) {
        const response = await ESI.post(`universe/names/`, ids);
        return response.data;
    },

    async getPilotStatus({token, CharacterID}) {
        try {
            const response = await ESI.get(`/characters/${CharacterID}/online/`, {
                params: {
                    token,
                }
            });
            return response.data;
        } catch (ex) {
            console.error("Error getting pilot's status.", ex.message)
            return null;
        }
    },

    async getPilotLocation({token, CharacterID}) {
        try {
            const response = await ESI.get(`/characters/${CharacterID}/location/`, {
                params: {
                    token,
                }
            });
            return response.data;
        } catch (ex) {
            console.error("Error getting pilot's location.", ex.message)
            return null
        }
    },

    async getPilotShip({token, CharacterID}) {
        try {
            const response = await ESI.get(`/characters/${CharacterID}/ship/`, {
                params: {
                    token,
                }
            });
            return response.data;
        } catch (ex) {
            console.error("Error getting pilot's ship.", ex.message)
            return null;
        }
    },
    async getType(typeId) {
        const response = await ESI.get(`/universe/types/${typeId}/`);
        return response.data;
    },

    async getStation(stationId) {
        const response = await ESI.get(`/universe/stations/${stationId}/`);
        return response.data;
    },

    async getCorporation(corporationId) {
        const response = await ESI.get(`/corporations/${corporationId}/`);
        return response.data;
    },

    async getSystem(systemId) {
        const response = await ESI.get(`/universe/systems/${systemId}/`);
        return response.data;
    },


    async getStructure(structureId) {
        try {
            const response = await ESI.get(`/universe/structures/${structureId}/`, {
                params: {
                    token: store.getters.auth.access_token,
                }
            });
            return response.data;
        } catch (ex) {
            console.error("Error getting structure.", ex.message)
            return false;
        }
    },


    async getStar(starId) {
        const response = await ESI.get(`/universe/stars/${starId}/`);
        return response.data;
    },


    async setWayPoint(destination_id, add_to_beginning = false, clear_other_waypoints = true) {
        try {
            const response = await ESI.post(`/ui/autopilot/waypoint/`, {}, {
                params: {
                    destination_id,
                    add_to_beginning,
                    clear_other_waypoints,
                    token: store.getters.auth.access_token,
                }
            });
            return response.status;
        } catch (ex) {
            console.error("Error setting waypoint.", ex.message)
        }
    },
    async route(origin, destination, {
        connections,
        flag
    }) {
        try {
            const response = await ESI.get(`/route/${origin}/${destination}/`, {
                params: {
                    flag,
                    connections: connections.map(con => `${con.from}|${con.to},${con.to}|${con.from}`).join(',')
                }
            });
            return response.data;
        } catch (ex) {
            console.log(ex.response);
            return {
                error: "No Route Found"
            };
        }
    }
};
