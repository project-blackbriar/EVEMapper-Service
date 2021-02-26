const db = require('./../db');
const express = require("express");
const axios = require('axios');
const qs = require('querystring');
const router = express.Router();
const users = db.Database().collection("users");
const IsAuth = require('./../middleware/auth');

const ESIAuth = axios.create({
    baseURL: 'https://login.eveonline.com'
});
const esiUrl = 'https://esi.evetech.net/latest/';
const ESI = axios.create({
    baseURL: esiUrl
});

router.post('/login', async (req, res) => {
    try {
        const response = await ESIAuth.post('/oauth/token', qs.stringify({
            grant_type: 'authorization_code',
            code: req.body.code,
        }), {
            auth: {
                username: process.env.EVE_CLIENT_ID,
                password: process.env.EVE_APP_SECRET
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Host": 'login.eveonline.com'
            }
        });
        const accessToken = response.data;
        const verifyResponse = await ESIAuth.get('/oauth/verify', {
            headers: {
                'User-Agent': req.headers['user-agent'],
                'Authorization': accessToken.token_type + ' ' + accessToken.access_token,
                'Host': 'login.eveonline.com'
            }
        });
        const charData = verifyResponse.data;
        const pilotDataResponse = await ESI.get(`/characters/${charData.CharacterID.toString()}/`)
        const dbUser = await users.findOneAndUpdate({
            CharacterID: charData.CharacterID.toString()
        }, {
            $set: {
                CharacterID: charData.CharacterID.toString(),
                lastLogin: new Date(),
                online: false,
                expires_in: Date.now() + (accessToken.expires_in * 1000),
                CharacterName: charData.CharacterName,
                refresh_token: accessToken.refresh_token,
                access_token: accessToken.access_token,
                corporation_id: pilotDataResponse.data.corporation_id
            }
        }, {
            upsert: true,
            new: true
        });
        res.send({
            ...dbUser.value,
            ...accessToken,
            ...charData,
            refresh_token: undefined
        });
    } catch (ex) {
        console.log(ex);
        res.sendStatus(403);
    }

});

router.get('/refresh', IsAuth, async (req, res) => {
    if (req.pilot) {
        try {
            const response = await ESIAuth.post('/oauth/token', qs.stringify({
                grant_type: 'refresh_token',
                refresh_token: req.pilot.refresh_token,
            }), {
                auth: {
                    username: process.env.EVE_CLIENT_ID,
                    password: process.env.EVE_APP_SECRET
                },
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Host": 'login.eveonline.com'
                }
            });
            const pilotDataResponse = await ESI.get(`/characters/${req.pilot.CharacterID}/`)
            const refreshData = response.data;
            await users.updateOne({
                CharacterID: req.pilot.CharacterID,
                access_token: req.pilot.access_token
            }, {
                $set: {
                    access_token: refreshData.access_token,
                    lastLogin: new Date(),
                    corporation_id: pilotDataResponse.data.corporation_id
                }
            });
            delete refreshData.refresh_token;
            res.send(refreshData);
        } catch (e) {
            console.error('Error trying to refresh token for pilot:', req.pilot.CharacterName)
            console.error(e.message)
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(403);
    }
});


module.exports = router;
