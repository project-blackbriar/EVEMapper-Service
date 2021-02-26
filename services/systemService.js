const db = require('../db');
const ObjectID = require("mongodb").ObjectID;
const systems = db.Database().collection('systems');

module.exports = {
    async getBySystemId(system_id) {
        return await systems.findOne({
            system_id: system_id
        });
    }
};
