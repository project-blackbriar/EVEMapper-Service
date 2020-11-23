const db = require('./../db');
const users = db.Database().collection('users');
module.exports = {
    setPilotMap: (pilot, mapId) => {
        users.updateOne({
            CharacterID: pilot.CharacterID
        }, {
            $set: {
                map: mapId
            }
        });
    }
};
