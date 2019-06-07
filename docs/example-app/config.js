"use strict";

// Ordinarily, you would set normally and not use environment variables,
// but this is for ease of running the example across platforms
const host = process.env.REDIS_HOST || '127.0.0.1';
const port = process.env.REDIS_PORT || 6379;

module.exports = {

    redis: {
        host,
        port,
        retry_strategy: /* istanbul ignore next: edge case */ function(options) {
            return Math.min(options.attempt * 100, 5000);
        },

        //retry_max_delay: 5000 // don't increase over 5s to reconnect
        // prefix: env?

        redlock: {
            driftFactor: 0.01, // the expected clock drift; for more details, see http://redis.io/topics/distlock
            retryCount:  50, // the max number of times Redlock will attempt to lock a resource before erroring
            retryDelay:  100 // the time in ms between attempts
        }

    },

    myGovernor: {
        maximumConcurrency: 2, // how many things can run in parallel across all instances of app at a given time
        redlock: {
            driftFactor: 0.01, // the expected clock drift; for more details, see http://redis.io/topics/distlock
            retryCount: 6000, // the max number of times Redlock will attempt to lock a resource before erroring
            retryDelay: 10 // the time in ms between attempts
        }, // ^ retry up to a minute
        name: 'my-app',
        ttl: 55000 // 55s to run a governed task
    }

};