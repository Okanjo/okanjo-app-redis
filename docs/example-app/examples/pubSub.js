"use strict";

// const RedisService = require('okanjo-app-redis');
// const RedisService = require('../../../RedisService');

module.exports = (app, callback) => {
    console.log('\nPub/Sub example');

    // Subscribe to two channels
    const channels = [ 'my_channel_1', 'my_channel_2' ];
    const subscriber = app.services.redis.getSubscriber(channels);

    subscriber.on('subscribe', (event) => {
        console.log(` * Subscribed to channel: ${event.channel}`);

        // Now lets send a message to the channel
        // Notice how this is getting sent by the original redis service instance
        app.services.redis.publish(event.channel, 'Hello there!', (err) => {
            if (err) console.error('Blew up sending a message to the channel', err);
            console.log(` * Message published to ${event.channel}`);
        });
    });

    let messageCount = 0;
    subscriber.on('message', (event) => {
        // Using setImmediate to break the event loop, so the console logs appear in the right order
        // Not really necessary for real apps
        setImmediate(() => {
            console.log(` * Got message in channel ${event.channel}: ${event.message}`);
            messageCount++;

            // Now let's stop subscribing
            if (messageCount === 2) {
                subscriber.quit((err) => {
                    if (err) console.error('Blew up unsubscribing!');
                });
            }
        });
    });

    let unsubCount = 0;
    subscriber.on('unsubscribe', (event) => {
        console.log(` * Unsubscribed from channel: ${event.channel}`);
        unsubCount++;

        // Done with this example
        if (unsubCount === 2) callback();
    });

};