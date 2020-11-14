const db = require('./../db');
const express = require("express");
const axios = require('axios');
const qs = require('querystring');
const router = express.Router();
const systems = db.Database().collection("systems");
const ObjectId = require('mongodb').ObjectID;
const IsAuth = require('./../middleware/auth');


router.get('/:id', IsAuth, async (req, res) => {
    console.log('Getting System')
    const data = (await systems.findOne({
        system_id: parseInt(req.params.id)
    }));
    data ? res.send(data) : res.sendStatus(404);
});

router.post('/:id', IsAuth, async (req, res) => {
    try {
        const data = await systems.findOneAndUpdate({
            system_id: parseInt(req.params.id)
        }, {
            $set: req.body
        }, {
            upsert: true,
            new: true
        });
        return res.send(data);
    } catch (ex) {
        console.log(ex);
        return res.sendStatus(500);
    }
});

module.exports = router;
