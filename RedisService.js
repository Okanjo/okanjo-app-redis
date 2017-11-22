"use strict";

const Redis = require('redis');
const Redlock = require('redlock');
const Subscriber = require('./Subscriber');
const Governor = require('./Governor');

/**
 * Redis management service
 */
class RedisService {

    /**
     * Constructor
     * @param app
     * @param config
     * @param [callback]
     */
    constructor(app, config, callback) {
        this.app = app;

        this.config = config || this.app.config.redis;
        this.redlockConfig = this.config.redlock || this.app.config.redlock;

        this.resourceLockKeyPrefix = this.config.resourceLockKeyPrefix || `${this.app.currentEnvironment}:resource-lock`;
        this.resourceLockTTL = this.config.resourceLockTTL || 5000; // 5 sec

        this.redis = null;
        this._reconnecting = false;

        // Register the connection with the app
        if (app.ready) {
            // App already started, we're late! Start connecting now...
            this.connect((err) => {
                /* istanbul ignore next: simply won't fire */
                if (callback) callback(err); // constructor callback
            });
        } else {
            app._serviceConnectors.push((cb) => {
                this.connect((err) => {
                    if (callback) callback(err); // constructor callback
                    cb(err); // app service callback
                });
            });
        }

    }

    /**
     * Creates a new instance of Redlock, suitable for things that don't want to use a one-size-fits-all locking scheme
     * @param config
     * @return {Redlock}
     */
    createRedlock(config) {
        return new Redlock(
            // Clients - see https://github.com/mike-marcacci/node-redlock for multiple servers
            [this.redis],
            config
        );
    }

    /**
     * Establishes the connection to redis
     * @param callback
     */
    connect(callback) {

        // Connect to redis and callback when the connection is ready
        this.redis = Redis.createClient(this.config);
        /* istanbul ignore next: error/reconnecting events out of scope */
        this.redis
            .once('ready', () => this._handleReady(callback))
            .on('connect', () => this._handleConnect())
            .on('error', (err) => this._handleError(err))
            .on('reconnecting', (event) => this._handleReconnect(event));


        // Init redlock (distributed mutex locks) on the client instance
        if (this.redlockConfig) {
            this.redlock = this.createRedlock(this.redlockConfig);
        }

        // Maybe we should bind process SIGINT and SIGTERM events
        // -idk- but for now just let the connection go down with the ship
        // only because other SIGINT/SIGTERM handlers might use redis before they die too
        // ¯\_(ツ)_/¯
    }

    /**
     * Handles a connection event
     * @private
     */
    _handleConnect() {
        /* istanbul ignore if: would require edge casing docker connection states */
        if (this._reconnecting) {
            this._reconnecting = false;
            this.app.log(' >> Redis connection reestablished');
        }
    }

    //noinspection JSMethodCanBeStatic
    /**
     * Handles the connection ready event by firing the given callback (bound)
     * @param callback - Fired when ready
     * @private
     */
    _handleReady(callback) {
        /* istanbul ignore else: would require edge casing docker connection states */
        setImmediate(() => {
            /* istanbul ignore else: edge case */
            if (callback) {
                callback();
                callback = null;
                // Don't fire the connect callback twice;
            }
        });
    }

    /* istanbul ignore next: would require edge casing docker connection states */
    /**
     * Handles a redis connection error event
     * @param err - Error that occurred
     * @private
     */
    _handleError(err) {
        this.app.report('Redis connection error reported', err);
    }

    /* istanbul ignore next: would require edge casing docker connection states */
    /**
     * Handles a redis reconnect event
     * @param event - Reconnect event info
     * @private
     */
    _handleReconnect(event) {
        this._reconnecting = true;
        this.app.log('Reconnecting to Redis in '+event.delay+'ms... (attempt #'+event.attempt+')');
    }

    /**
     * Gets the cached key value from Redis or sets the value if not present
     * @param key
     * @param notCachedClosure
     * @param callback
     */
    getSet(key, notCachedClosure, callback) {
        this.redis.get(key, (err, res) => {
            /* istanbul ignore if: redis edge case */
            if (err) {
                this.app.report("Blew up in redis getSet", err, key);
                callback(err, undefined, false);
            } else {
                if (res) {
                    try {
                        res = JSON.parse(res);
                    } catch (e) {
                        this.app.report("Blew up parsing redis key value in getSet", e, key);
                        return callback(e, undefined, false);
                    }

                    // Don't callback inside try-catch so we don't catch upstream errors - that's your problem.
                    callback(err, res, true);
                } else {
                    notCachedClosure((err, obj, ttl) => {
                        // only cache if the value is not undefined
                        if (!err && obj !== undefined) {
                            this.redis.set(key, JSON.stringify(obj), 'PX', ttl);
                            callback(err, obj, false);
                        } else {
                            callback(err, undefined, false);
                        }
                    });
                }
            }
        });
    }

    /**
     * Base locking helper, available for use an arbitrary instances of redlocks
     * @param {Redlock} redlock - The instance of redlock we're going to use
     * @param {string} key - The resource key to lock
     * @param {number} ttl – Maximum amount of milliseconds to keep the resource locked, unless extended
     * @param {function} whenLocked – What to do when we have the lock
     * @param {function} callback – Fired when completed or failed
     */
    lock(redlock, key, ttl, whenLocked, callback) {
        redlock.lock(key, ttl, (err, lock) => {
            /* istanbul ignore if: out of scope */
            if (err) {
                this.app.report('Failed to obtain resource lock!', { err, key, ttl });
                err.lockFailed = true; // you can test for this specific use case here
                callback(err);
            } else {

                // Provide the done function to let the user call when they're done with the lock, and also expose the raw lock so they may extend it if they choose to do so.
                const done = (userErr) => {
                    // Attempt to clear the lock
                    lock.unlock((err) => {

                        /* istanbul ignore if: out of scope */
                        if (err) {
                            this.app.report('Failed to release resource lock!', { err, key, ttl });
                        }

                        callback(userErr);
                    });
                };

                whenLocked(done, lock);
            }
        });
    }

    /**
     * Reusable system in which to lock resources while acting upon them.
     * @param {string} resource_type
     * @param {string} resource_id -
     * @param {function(done:function, lock:object)} whenLocked - Fired when resource lock has been obtained
     * @param {function(err:object)} callback - Fired when lock has been released or there was an error obtaining the lock
     */
    lockResource(resource_type, resource_id, whenLocked, callback) {
        const key = `${this.resourceLockKeyPrefix}:${resource_type}:${resource_id}`;
        this.lock(this.redlock, key, this.resourceLockTTL, whenLocked, callback);
    }

    /**
     * Builds a new Subscriber connection to handle listening for subscriptions on the given array of channels
     * @param {[String]} channels – Array of channel names
     * @param {*} [options] – Additional Subscriber constructor options
     * @return {Subscriber}
     */
    getSubscriber(channels, options) {
        if (!channels || channels.length === 0) {
            this.app.report('WARNING: SUBSCRIBING TO NO CHANNELS. DEFAULTING TO `global`', channels);
            channels = ['global'];
        }

        // Take additional options
        options = options || {};
        options.channels = channels;
        options.mode = options.mode || Subscriber.modes.subscribe;

        return new Subscriber(this.app, this.config, options);
    }

    /**
     * Builds a new Subscriber connection to handle listening for channel patterns on the given array of patterns
     * @param {[String]} [channelPatterns] - Array of channel patterns
     * @return {Subscriber}
     */
    getPatternSubscriber(channelPatterns) {
        const options = {
            mode: Subscriber.modes.psubscribe,
            channels: channelPatterns
        };
        return new Subscriber(this.app, this.config, options);
    }

    /**
     * Publishes a message object to a given channel (use this with subscribers)
     * @param {string} channel – Channel name
     * @param {obj} message - Message payload
     * @param {function} [callback] – Function to fire when completed
     */
    publish(channel, message, callback) {
        this.redis.publish(channel, JSON.stringify(message), callback);
    }
}

// Export other classes too
RedisService.Redis = Redis;
RedisService.Redlock = Redlock;
RedisService.Subscriber = Subscriber;
RedisService.Governor = Governor;

module.exports = RedisService;