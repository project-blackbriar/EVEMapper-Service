const { Webhook } = require('discord-webhook-node');
const hook = new Webhook(process.env.DISCORD_WEBHOOK_URL);

module.exports = {
    async success(data) {
        try {
            hook.send("Hello there!") 
        } catch (err) {
            console.error(err.message) 
        }
    }
}

// Usage for consideration:
// const discord = require('./services/discord')
// discord.success('Nice!')