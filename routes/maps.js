const db = require('./../db');
const express = require("express");
const axios = require('axios');
const qs = require('querystring');
const router = express.Router();
const maps = db.Database().collection("maps");
const users = db.Database().collection("users");
const ObjectId = require('mongodb').ObjectID;
const IsAuth = require('./../middleware/auth');
const {io} = require('./../main');
router.get('/', IsAuth, async (req, res) => {
    const data = (await maps.find({
        active: true
    }, {
        name: true,
        active: true
    }).toArray());
    res.send(data);
});

router.get('/:id', IsAuth, async (req, res) => {
    const data = (await maps.findOne({
        active: true,
        _id: ObjectId(req.params.id)
    }, {
        name: true,
        active: true
    }));
    res.send(data);
});

router.post('/active/:id', IsAuth, async (req, res) => {
    await users.updateOne({
        CharacterID: req.pilot.CharacterID
    }, {
        $set: {
            map: req.params.id
        }
    });
    res.sendStatus(200);
});


router.post('/:id/location', IsAuth, async (req, res) => {
    const pilots = (await users.find({
        'location.solar_system_id': req.body.system_id,
        online: true
    }).toArray()).map(val => {
        return {
            name: val.CharacterName,
            ship: val.ship
        };
    });
    const doc = {
        ...req.body,
        pilots: pilots
    };
    const data = await maps.findOneAndUpdate({
        _id: ObjectId(req.params.id),
        'locations.system_id': {$ne: req.body.system_id}
    }, {
        $push: {
            'locations': doc,
        }
    });
    io.to(req.pilot.map).emit('addLocation', {system: doc});
    return res.sendStatus(200);
});

router.delete('/:id/location/:system_id', IsAuth, async (req, res) => {
    const data = await maps.findOneAndUpdate({
        _id: ObjectId(req.params.id),
        'locations.system_id': parseInt(req.params.system_id)
    }, {
        $pull: {
            'locations': {system_id: parseInt(req.params.system_id)},
        }
    });
    io.to(req.pilot.map).emit('removeLocation', req.params.system_id);
    return res.sendStatus(200);
});

router.put('/:id/location', IsAuth, async (req, res) => {
    const data = await maps.updateOne({
        _id: ObjectId(req.params.id),
        'locations.system_id': req.body.system_id,
    }, {
        $set: {
            'locations.$': req.body,
        }
    });
    io.to(req.params.id).emit('updateLocation', req.body);
    return res.sendStatus(200);
});

router.post('/:id/pilot/:system_id', IsAuth, async (req, res) => {
    await maps.findOneAndUpdate({
        _id: ObjectId(req.params.id),
        'locations.pilots': req.pilot.CharacterName
    }, {
        $pull: {
            'locations.$.pilots': req.pilot.CharacterName,
        }
    });
    await maps.findOneAndUpdate({
        _id: ObjectId(req.params.id),
        'locations.system_id': parseInt(req.params.system_id),
        'locations.pilots': {$ne: req.pilot.CharacterName}
    }, {
        $push: {
            'locations.$.pilots': req.pilot.CharacterName
        }
    });
    return res.sendStatus(200);
});

module.exports = router;
