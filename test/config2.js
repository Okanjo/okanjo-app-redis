
const host = process.env.REDIS_HOST || '192.168.99.100';
const port = process.env.REDIS_PORT || 6379;

module.exports = {
    redis: {
        host,
        port,
        retry_strategy: /* istanbul ignore next: edge case */ function(options) {
            return Math.min(options.attempt * 100, 5000);
        }
        //retry_max_delay: 5000 // don't increase over 5s to reconnect
        // prefix: env?
    }

    // Distributed mutex locks based on the redis redlock aglorithm
    // See https://github.com/mike-marcacci/node-redlock
    //redlock: {
    //    driftFactor: 0.01, // the expected clock drift; for more details, see http://redis.io/topics/distlock
    //    retryCount:  50, // the max number of times Redlock will attempt to lock a resource before erroring
    //    retryDelay:  100 // the time in ms between attempts
    //}
};