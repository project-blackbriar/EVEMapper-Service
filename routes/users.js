const db = require('./../db');
const express = require("express");
const router = express.Router();
const users = db.Database().collection("users");
const IsAuth = require('./../middleware/auth');

router.post('/route', IsAuth, async (req, res) => {
    await users.updateOne({
        CharacterID: req.pilot.CharacterID
    }, {
        $push: {
            routes: req.body
        }
    });
    res.sendStatus(200)
});

router.delete('/route/:system/:flag', IsAuth, async (req, res) => {
    await users.updateOne({
        CharacterID: req.pilot.CharacterID
    }, {
        $pull: {
            routes: {destination: parseInt(req.params.system), flag: req.params.flag}
        }
    });
    res.sendStatus(200)
});


module.exports = router;
