"use strict";

const OkanjoApp = require('okanjo-app');
// const RedisService = require('okanjo-app-redis');
const RedisService = require('../../RedisService');

const config = require('./config');
const app = new OkanjoApp(config);

app.services = {
    redis: new RedisService(app, config.redis)
};

app.connectToServices(() => {

    // Run the various examples
    const examples = [
        require('./examples/governor'),
        require('./examples/pubSub'),
        require('./examples/resourceLocking')
    ];

    // Super simple series iterator
    let iterator = (callback) => {
        if (examples.length === 0) {
            callback();
        } else {
            const example = examples.shift();
            example(app, () => iterator(callback));
        }
    };

    iterator(() => {
        console.log('DONE');
        process.exit(0);
    });

});