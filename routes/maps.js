const db = require('./../db');
const express = require("express");
const axios = require('axios');
const qs = require('querystring');
const router = express.Router();
const maps = db.Database().collection("maps");
const users = db.Database().collection("users");
const ObjectId = require('mongodb').ObjectID;
const IsAuth = require('./../middleware/auth');

const mapService = require('./../services/mapService');
const userService = require('./../services/userService');
const systemService = require('./../services/systemService');
const eveService = require('./../services/eveService');
const ioService = require('./../services/ioService');


router.get('/', IsAuth, async (req, res) => {
    const data = (await maps.find({
        active: true,
        $or: [
            {corporation_whitelist: req.pilot.corporation_id},
            {character_whitelist: parseInt(req.pilot.CharacterID)}
        ]
    }, {
        name: true,
        active: true
    }).toArray());
    res.send(data);
});

router.get('/:id', IsAuth, async (req, res) => {
    const data = (await maps.findOne({
        active: true,
        _id: ObjectId(req.params.id),
        $or: [
            {corporation_whitelist: req.pilot.corporation_id},
            {character_whitelist: parseInt(req.pilot.CharacterID)}
        ]
    }, {
        name: true,
        active: true
    }));
    res.send(data);
});

router.post('/active/:id', IsAuth, async (req, res) => {
    try {
        await Promise.all([
            userService.setPilotMap(req.pilot, req.params.id),
            mapService.removePilotFromMaps(req.pilot)
        ]);
        if (req.pilot.onlineStatus?.online) {
            await mapService.addPilotToMap(req.params.id, req.pilot);
        }
        res.sendStatus(200);
    } catch (ex) {
        console.log(ex);
        req.sendStatus(500);
    }
});

/* Add new location to map */
router.post('/:id/location', IsAuth, async (req, res) => {
    const system = await systemService.getBySystemId(req.body.system_id);
    delete system._id;
    if (await mapService.addSystemToMap(req.params.id, system)) {
        await ioService.systems.add(req.params.id, system);
    }
    return res.sendStatus(200);
});

/* Delete location from map */
router.delete('/:id/location/:system_id', IsAuth, async (req, res) => {
    await mapService.removeConnectionsForSystem(req.params.id, req.params.system_id);
    await mapService.removeSystemFromMap(req.params.id, req.params.system_id);
    await ioService.connections.delink(req.params.id, req.params.system_id);
    await ioService.systems.remove(req.params.id, req.params.system_id);
    return res.sendStatus(200);
});
/* Update location details */
router.put('/:id/location', IsAuth, async (req, res) => {
    await Promise.all([
        mapService.updateSystemInMap(req.params.id, req.body),
        ioService.systems.update(req.params.id, req.body)
    ]);
    return res.sendStatus(200);
});

router.post('/:id/connection/add', IsAuth, async (req, res) => {
    await mapService.addConnectionToMap(req.params.id, req.body.connection.from, req.body.connection.to)
    ioService.connections.add(req.params.id, req.body.connection)
    return res.sendStatus(200)
});

router.put('/:id/connection', IsAuth, async (req, res) => {
    await Promise.all([
        mapService.updateConnectionInMap(req.params.id, req.body),
        ioService.connections.update(req.params.id, req.body)
    ]);
    return res.sendStatus(200);
});

router.post('/:id/connection/delete', IsAuth, async (req, res) => {
    await mapService.deleteConnection(req.params.id, req.body.connection)
    ioService.connections.remove(req.params.id, req.body.connection)
    return res.sendStatus(200)
})

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

router.get('/:id/routes/:origin', IsAuth, async (req, res) => {
    if (req.pilot.routes) {
        const connections = await mapService.getConnections(req.params.id);
        const routes = await Promise.all(req.pilot.routes.map(async route => {
            const routeIds = await eveService.route(req.params.origin, route.destination, {
                flag: route.flag,
                connections
            });
            if (routeIds.error) {
                return {
                    systems: routeIds.error,
                    flag: route.flag,
                    destination: await systemService.getBySystemId(route.destination),
                };
            }
            return {
                destination: await systemService.getBySystemId(route.destination),
                flag: route.flag,
                systems: await Promise.all(routeIds.map(id => {
                    return systemService.getBySystemId(id);
                }))
            };
        }));
        res.send(routes);
    } else res.send([]);
});

module.exports = router;
