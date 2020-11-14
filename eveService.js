const axios = require('axios');

module.exports = class EveService {

    constructor() {
        this.eveUrl = 'https://esi.evetech.net/latest/';
        this.ESI = axios.create({
            baseURL: this.eveUrl
        });
    }

    async getUniverseIds(names) {
        const response = await this.ESI.post(`universe/ids/`, names);
        return response.data;
    }

    async getUniverseNames(ids) {
        const response = await this.ESI.post(`universe/names/`, ids);
        return response.data;
    }

    async getPilotStatus({token, CharacterID}) {
        try {
            const response = await this.ESI.get(`/characters/${CharacterID}/online/`, {
                params: {
                    token,
                }
            });
            return response.data;
        } catch (ex) {
            return null;
        }
    }

    async getPilotLocation({token, CharacterID}) {
        try {
            const response = await this.ESI.get(`/characters/${CharacterID}/location/`, {
                params: {
                    token,
                }
            });
            return response.data;
        } catch (ex) {
            return null;
        }
    }


    async getStation(stationId) {
        const response = await this.ESI.get(`/universe/stations/${stationId}/`);
        return response.data;
    }

    async getCorporation(corporationId) {
        const response = await this.ESI.get(`/corporations/${corporationId}/`);
        return response.data;
    }

    async getSystem(systemId) {
        const response = await this.ESI.get(`/universe/systems/${systemId}/`);
        return response.data;
    }


    async getStructure(structureId) {
        try {
            const response = await this.ESI.get(`/universe/structures/${structureId}/`, {
                params: {
                    token: store.getters.auth.access_token,
                }
            });
            return response.data;
        } catch (ex) {
            return false;
        }
    }


    async getStar(starId) {
        const response = await this.ESI.get(`/universe/stars/${starId}/`);
        return response.data;
    }


    async setWayPoint(destination_id, add_to_beginning = false, clear_other_waypoints = true) {
        try {
            const response = await this.ESI.post(`/ui/autopilot/waypoint/`, {}, {
                params: {
                    destination_id,
                    add_to_beginning,
                    clear_other_waypoints,
                    token: store.getters.auth.access_token,
                }
            });
            return response.status;
        } catch (ex) {
            console.log(ex);
        }
    }
};
