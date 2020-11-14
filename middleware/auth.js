const db = require('./../db');
const users = db.Database().collection("users");

const IsAuth = async (req, res, next) => {
    const pilot = await users.findOne({
        access_token: req.query.token
    });
    if (pilot) {
        req.pilot = pilot;
        next();
    } else {
        res.sendStatus(403);
    }
};

module.exports = IsAuth;
