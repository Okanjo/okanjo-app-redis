"use strict";

const EventEmitter = require('events').EventEmitter;

class Subscriber extends EventEmitter {

    /**
     * Constructor
     * @param {OkanjoApp} app – okanjo application
     * @param {Object} config – Redis configuration
     * @param {Object} options – Subscriber options
     */
    constructor(app, config, options) {
        super();

        this.app = app;
        this.config = config;

        this.channels = options.channels || ['*'];
        this.mode = options.mode;

        /**
         * Redis service instance
         * @type {null}
         * @private
         */
        this._service = null;

        /**
         * Whether the subscriber is subscribed to any channels or not
         * @type {boolean}
         * @private
         */
        this._subscribed = false;

        // Connect to redis to get this party started
        this._connect(options.callback);

    }

    /**
     * Gets whether the subscriber has any active listeners
     * @return {boolean|*}
     */
    isSubscribed() {
        return this._subscribed;
    }

    /**
     * Creates a connection to redis and starts subscribing when ready
     * @param [callback]
     * @private
     */
    _connect(callback) {
        const RedisService = require('./RedisService'); // put here to prevent dependency circle
        this._service = new RedisService(this.app, this.config, () => {
            this._subscribe(callback);
        });
    }

    /**
     * Handles subscribing to channels based on instance configuration
     * @param [callback]
     * @private
     */
    _subscribe(callback) {
        // Build subscribe command args
        const args = [].concat(this.channels);

        /* istanbul ignore if: this is a weird use case, but it should work */
        if (callback) {
            args.push(callback);
        }

        // Bind events
        this._service.redis.on('subscribe', (channel, count) => {
            this._onSubscribe(channel, count);
        });

        this._service.redis.on('psubscribe', (pattern, count) => {
            this._onSubscribe(pattern, count);
        });

        this._service.redis.on('unsubscribe', (channel, count) => {
            this._onUnsubscribe(channel, count);
        });

        this._service.redis.on('punsubscribe', (pattern, count) => {
            this._onUnsubscribe(pattern, count);
        });

        this._service.redis.on('message', (channel, message) => {
            this._onMessage(channel, message);
        });

        this._service.redis.on('pmessage', (pattern, channel, message) => {
            this._onMessage(channel, message, pattern);
        });

        if (this.mode === Subscriber.modes.subscribe) {
            this._service.redis.subscribe.apply(this._service.redis, args);
        } else {
            this._service.redis.psubscribe.apply(this._service.redis, args);
        }
    }

    /**
     * Occurs when a channel subscription has started
     * @param {string} channel – Channel name or pattern
     * @param {number} count – Number of active channel listeners
     * @private
     */
    _onSubscribe(channel, count) {
        this._updateSubscriberStatus(count);
        this.emit('subscribe', { channel, count });
    }

    /**
     * Occurs when a the listener has unsubscribed from a channel
     * @param {string} channel – Channel name or pattern
     * @param {number} count – Number of active channel listeners remaining
     * @private
     */
    _onUnsubscribe(channel, count) {
        this._updateSubscriberStatus(count);
        this.emit('unsubscribe', { channel, count });
    }

    /**
     * Occurs when a message is received on a channel
     * @param {string} channel – Channel name
     * @param {string} message – Channel message
     * @param pattern
     * @private
     */
    _onMessage(channel, message, pattern) {
        try {
            message = JSON.parse(message);
        } catch (e)  {
            /* istanbul ignore next: out of scope */
            this.app.report('Could not parse JSON out of Subscriber onMessage hook', e, channel, message, pattern);
        }
        this.emit('message', { channel, message, pattern });
    }

    /**
     * Internally handles the subscribed flag
     * @param count
     * @private
     */
    _updateSubscriberStatus(count) {
        this._subscribed = count > 0;
    }

    /**
     * Unsubscribes from a given array of channels/patterns or all if none given
     * @param {[String]} [channels] - Array of channels or patterns
     * @param [callback]
     */
    unsubscribe(channels, callback) {

        if (typeof channels === "function") {
            callback = channels;
            channels = null;
        }

        let args = [];
        if (channels) {
            args = [].concat(channels); // given channels
        } else {
            args = [].concat(this.channels); // all channels if none given
        }

        if (callback) args.push(callback);

        if (this._service) {
            if (this.mode === Subscriber.modes.subscribe) {
                this._service.redis.unsubscribe.apply(this._service.redis, args);
            } else {
                this._service.redis.punsubscribe.apply(this._service.redis, args);
            }
        } else {
            if (callback) callback(new Error('Subscriber: Not connected to redis'));
        }
    }

    /**
     * Shuts down the subscriber
     * @param callback
     */
    quit(callback) {
        this.unsubscribe((err) => {
            /* istanbul ignore if: out of scope */
            if (err) {
                this.app.report('Blew up unsubscribing from Redis', err, this.channels, this.mode);
            }
            this._service.redis.quit(callback);
            this._service = null;
        });
    }


}

/**
 * Subscriber modes
 * @type {{subscribe: string, psubscribe: string}}
 */
Subscriber.modes = {
    subscribe: 'subscribe', // single channel mode
    psubscribe: 'psubscribe' // wildcard channel mode
};

module.exports = Subscriber;