# Okanjo Redis Service

[![Node.js CI](https://github.com/Okanjo/okanjo-app-redis/actions/workflows/node.js.yml/badge.svg)](https://github.com/Okanjo/okanjo-app-redis/actions/workflows/node.js.yml) [![Coverage Status](https://coveralls.io/repos/github/Okanjo/okanjo-app-redis/badge.svg?branch=master)](https://coveralls.io/github/Okanjo/okanjo-app-redis?branch=master)

Service for interfacing with Redis for the Okanjo App ecosystem.

This package:

* Manages connectivity and reconnection edge cases
* Includes Redlock for distributed mutex locking and synchronization
* Provides utility functions for common operations (e.g. getOrSet, resource locking, etc) 
* Provides pub-sub interfaces

## Breaking Changes

### 4.0
 * Updated to node-redis 3.1.2
 * Updated redlock to v4.2.0
 * Updated to okanjo-app v3

### 3.0
 * `getSet` has been renamed to `getOrSet`
 * `publish` no longer takes a callback, only returns a Promise
 * Most RedisService properties have been prefixed with `_`
 * All Redis commands have been wrapped and exposed directly on RedisService (e.g. service.get, service.set, ...)  

## Installing

Add to your project like so: 

```sh
npm install okanjo-app-redis
```

Note: requires the [`okanjo-app`](https://github.com/okanjo/okanjo-app) module.

## Example Usage

Here's an example app that demonstrates using several features of the module.

* `example-app`
  * `examples/`
    * `governor.js`
    * `pubSub.js`
    * `resourceLocking.js`
  * `config.js`
  * `index.js`
  
### `example-app/examples/governor.js`
This example module uses the Governor class to limit concurrent tasks across distributed systems. For example, if you 
use a service that rate limits you to two simultaneous requests at a time, you could use Governor to ensure that all your
application instances do not send more than two requests at a time.

```js
"use strict";

module.exports = (app, callback) => {

    console.log('\nGovernor example');

    const Governor = require('okanjo-app-redis/Governor');

    const governor = new Governor(app.services.redis, {
        name: 'myGovernor',
        maximumConcurrency: 2
    });


    const tasks = 6;
    let completed = 0;
    for (let i = 0; i < tasks; i++) {
        governor.runTask((unlock, lock, workerNumber) => {
            console.log(` * Task ${i} ran on worker ${workerNumber}`);
            completed++;
            unlock();
        }, (/*err*/) => {
            console.log(` * Task ${i} completed.`);

            // Check for example completion
            if (completed === tasks) {
                callback();
            }
        });
    }
};
```

### `example-app/examples/pubSub.js`
This example demonstrates how to publish messages and create a subscriber to listen for messages in redis channels.

```js
"use strict";

const RedisService = require('okanjo-app-redis');

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
```

### `example-app/examples/resourceLocking.js`
This example demonstrates how to use resource locking to limit concurrent access to something.

```js
"use strict";

module.exports = (app, callback) => {
    console.log('\nResource locking example');

    // Fire off three simultaneous attempts to access a resource
    const resourceType = 'my_thing';
    const resource = {
        id: 1,
        name: "bananas",
        accessed: 0
    };

    // Function to exit the example when completed
    const checkDone = () => {
        if (resource.accessed === 3) callback();
    };

    // This operation could be performed on separate apps or servers
    app.services.redis.lockResource(resourceType, resource.id, (done/*, lock*/) => {
        console.log(' * Worker 1 locked resource');
        resource.accessed += 1;

        done();

    }, checkDone);

    app.services.redis.lockResource(resourceType, resource.id, (done/*, lock*/) => {
        console.log(' * Worker 2 locked resource');
        resource.accessed += 1;

        done();

    }, checkDone);

    app.services.redis.lockResource(resourceType, resource.id, (done/*, lock*/) => {
        console.log(' * Worker 3 locked resource');
        resource.accessed += 1;

        done();

    }, checkDone);

};
```

### `example-app/config.js`
This is a basic configuration for the redis service

```js
"use strict";

// Ordinarily, you would set normally and not use environment variables,
// but this is for ease of running the example across platforms
const host = process.env.REDIS_HOST || '192.168.99.100';
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
```

### `example-app/index.js`
This is the example app, which runs the various examples in series.

```js
"use strict";

const OkanjoApp = require('okanjo-app');
const RedisService = require('okanjo-app-redis');

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
```

The output of the application should look something like this:
```text

Governor example
 * Task 0 ran on worker 1
 * Task 0 completed.
 * Task 1 ran on worker 0
 * Task 1 completed.
 * Task 4 ran on worker 0
 * Task 4 completed.
 * Task 2 ran on worker 1
 * Task 3 ran on worker 0
 * Task 2 completed.
 * Task 3 completed.
 * Task 5 ran on worker 0
 * Task 5 completed.

Pub/Sub example
 * Subscribed to channel: my_channel_1
 * Subscribed to channel: my_channel_2
 * Message published to my_channel_1
 * Message published to my_channel_2
 * Got message in channel my_channel_1: Hello there!
 * Got message in channel my_channel_2: Hello there!
 * Unsubscribed from channel: my_channel_1
 * Unsubscribed from channel: my_channel_2

Resource locking example
 * Worker 1 locked resource
 * Worker 3 locked resource
 * Worker 2 locked resource
DONE
```

A runnable version of this application can be found in [docs/example-app](https://github.com/okanjo/okanjo-app-redis/tree/master/docs/example-app).


# RedisService

Redis management class. Must be instantiated to be used.

## Properties
* `service.app` – (read-only) The OkanjoApp instance provided when constructed
* `service._config` – (read-only) The redis service configuration provided when constructed
* `service._redlockConfig` – (read-only) The redlock configuration provided when constructed
* `service._resourceLockKeyPrefix` – (read-only) The prefix to use on resource lock key names
* `service._resourceLockTTL` – (read-only) The default maximum amount of time a resource lock will live for, before manual renewing
* `service.redis` – (read-only) The underlying [node_redis](https://github.com/NodeRedis/node_redis) connection 

## Methods

### `new RedisService(app, [config], [callback])`
Creates a new redis service instance.
* `app` – The OkanjoApp instance to bind to
* `config` – (Optional) The redis service configuration object. Defaults to app.config.redis if not provided.
  * The configuration extends the [node_redis](https://github.com/NodeRedis/node_redis#rediscreateclient) configuration. See there for additional options.
  * `config.redlock` – Redlock configuration object. See [node-redlock](https://github.com/mike-marcacci/node-redlock#configuration) for additional options. Defaults to `app.config.redlock` or `undefined`.
  * `config.resourceLockKeyPrefix` – Prefix to include when locking resources. Defaults to `${app.currentEnvironment}:resource-lock`
  * `config.resourceLockTTL` – How long a resource lock should live for before having to be extended or expires in milliseconds. Defaults to `5000` (5s). 
* `callback` – (Optional) Function to fire as soon as redis is connected

### `service[redisCommandName](...args)`
All Redis commands are wrapped with a promise and exposed as service.command(args). 
 * Do not provide a callback.
 * Arguments are variable to the command being executed.

Example:
```js
await app.services.redis.set('your_key', 'hello there');
const res = await app.services.redis.get('your_key'); // res = 'hello there'
```

### `service.createRedlock(config)`
Creates a new redlock instance. Useful for creating different locking algorithms for different purposes, where a one-size-fits-all approach does not work.
* `config` – Redlock configuration object. See [node-redlock](https://github.com/mike-marcacci/node-redlock#configuration) for additional options.

### `service.getOrSet(key, notCachedClosure, [callback])`
* Gets a value, or sets the value if not already set. Useful for cache lookups.
* `key` - String key name to fetch
* `notCachedClosure((err, obj, ttl) => {...})` – Function to fire when the value is not cached in redis. The function is expected to callback with the value to cache.
  * `err` – Set this to truthy if there was an error getting the value to store
  * `obj` – The value to store in redis under the `key` cache key. If you try to store an `undefined` value, no redis key will be created.
  * `ttl` – How long to store the key in redis, in milliseconds
* `callback(err, obj, wasCached)` – Optional function to fire after getting/setting the cached value
  * `err` – Error, if applicable, when getting or setting the cached value
  * `obj` – The decoded cached object. 
  * `wasCached` – Boolean whether the value was already cached (`true`) or not (`false`)
* Returns a `Promise`.

Cached values are JSON serialized, so you can safely send it nearly anything. If you try to store `undefined`, it will not skip setting a key in redis.

This utility function makes using cached values super simple. For example:

```js
service.getOrSet(
    'cache_key',
    (setCache) => {
        setCache(null, { hello: 'world' }, 15000); // Store this object for 15s
    },
    (err, value, wasCached) => {
        if (err) console.error('Blew up getting the cached value for cache_key', err);
        
        // This callback doesn't really care whether the value was cached or not
        // but if you did care, there's a callback argument for that
        
        if (wasCached) {
            console.log('Cached value: ', value.world);
        } else {
            console.log('Newly cached value', value.world);
        }
    }
);
```  

### `service.lock(redlock, key, ttl, whenLocked, [callback])`
Wrapper for locking using an arbitrary redlock instance.
* `redlock` – Redlock instance to use for the lock
* `key` – The key to lock
* `ttl` – Initial amount of time in milliseconds before the lock expires, unless manually extended
* `whenLocked(done, lock)` – Function to fire when the lock has been acquired.
  * `done(err) => { ... }` – Callback to fire when you are done with the lock.
    * `err` – Set an error if you experienced an error during your lock
  * `lock` – The [Redlock lock instance](https://github.com/mike-marcacci/node-redlock#locking-and-extending-1). Useful if you need to extend the lock because something is taking longer than expected.
* `callback(err)` – Optional function to fire when done locking or if the lock could not be obtained.
  * `err` – Error, if applicable, from redlock or the whenLocked function.
  * `err.lockFailed` – If set, the error resulted from failure to acquire the lock. Useful if you simply want to retry than explode your app.
* Returns a `Promise`.
  
### `service.lockResource(resourceType, resourceId, whenLocked, [callback])`
Utility function to get a simple resource lock on something. Great for synchronizing resource changes across competing applications or instances.
* `resourceType` – The string type of thing you are locking. For example: `account`
* `resourceId` – The id of the instance of thing you are locking, For example, `12345`
* `whenLocked(done, lock)`
* `whenLocked(done, lock)` – Function to fire when the lock has been acquired.
  * `done(err) => { ... }` – Callback to fire when you are done with the lock.
    * `err` – Set an error if you experienced an error during your lock
  * `lock` – The [Redlock lock instance](https://github.com/mike-marcacci/node-redlock#locking-and-extending-1). Useful if you need to extend the lock because something is taking longer than expected.
* `callback(err)` – Optional function to fire when done locking or if the lock could not be obtained.
  * `err` – Error, if applicable, from redlock or the whenLocked function.
  * `err.lockFailed` – If set, the error resulted from failure to acquire the lock. Useful if you simply want to retry than explode your app.
* Returns a `Promise`

### `service.getSubscriber(channels, [options])`
Gets a new Subscriber class instance. The redis connection of the service is cloned.
* `channels` – Array of channel names to subscribe to.
* `options` – (Optional) Additional Subscriber constructor options, if needed.

### `service.getPatternSubscriber(channelPatterns)`
Gets a new Subscriber class instance that subscribes to channel patterns instead channel names.
* `channelPatterns` – Array of channel patterns (e.g. psubscribe) to subscribe to. For example, `my_channel_*`
 
### `service.publish(channel, message)`
Publishes a message to a channel.
* `channel` – The name of the channel to publish to
* `message` – The object to publish to the channel. JSON.stringify is used to serialize objects.

## Events

This class does not emit events.


# Governor

Class for limiting concurrent operations of a given task. 

For example, you could use this class if you needed to limit concurrent outgoing connections to service.  

## Properties
* `governor.service` – (read-only) The RedisService instance provided when constructed
* `governor.maximumConcurrency` – (read-only) The maximum number of tasks that are permitted to run at one time
* `governor.locker` – (read-only) The Redlock instance used by this governor
* `governor.prefix` – (read-only) The prefix given to redis keys managed by the governor
* `governor.ttl` – (read-only) How long the task has to complete before the lock expires

## Methods

### `new Governor(redisService, options)`
Creates a new instance of the governor.
* `redisService` – The RedisService instance to bind to
* `options` – Governor configuration options
  * `options.name` – The name of the governor. Use different names when creating more than one governor instance. Defaults to `default`. 
  * `options.maximumConcurrency` – How many tasks are permitted to run at a given time. Defaults to `2`.
  * `options.redlock` – Redlock configuration object. See [node-redlock](https://github.com/mike-marcacci/node-redlock#configuration) for additional options.
  * `options.ttl` – How long in milliseconds the task has to run before the underlying lock expires. Defaults to `55000` (55s).

### `govenror.runTask(closure, [callback])`
Runs a task on the governor, when able to do so.
* `closure(unlock, lock, workerNumber)` – Task function to run
  * `unlock(err)` – Callback to fire when done running the task. Set `err` if you need to bubble an error out.
  * `lock` – The [Redlock lock instance](https://github.com/mike-marcacci/node-redlock#locking-and-extending-1). Useful if you need to extend the lock because something is taking longer than expected.
  * `workerNumber` – Which worker slot is running this task. For example, if your concurrency is `2`, then workerNumber could be either `0` or `1`, depending on which slot is available.
* `callback(err)` – Optional function to fire when task has ended
* Returns a `Promise`. 

## Events

This class does not emit events.


# Subscriber

Class for handling subscribing to redis channels. Extends EventEmitter. 

Subscriber is an event driven structure. Check out the [docs/example-app](https://github.com/okanjo/okanjo-app-redis/tree/master/docs/example-app) for usage.

## Properties
* `subscriber.app` – (read-only) The OkanjoApp instance provided when constructed
* `subscriber.config` – (read-only) The RedisService configuration provided when constructed
* `subscriber.channels` – (read-only) The channels or patterns the subscriber should subscribe to
* `subscriber.mode` – (read-only) Whether the subscriber should use subscribe (channels) or psubscribe (patterns)

## Methods

### `new Subscriber(app, config, options)`
Creates a new subscriber instance.
* `app` – The OkanjoApp instance to bind to
* `config` – The redis service configuration object. The configuration extends the [node_redis](https://github.com/NodeRedis/node_redis#rediscreateclient) configuration. See there for additional options.
* `options` – Subscriber configuration options
  * `options.channels` – Array of channels or patterns to subscribe to. Defaults to `[*]` (all channels)
  * `options.mode` – (Optional) Subscription mode. Use the static enumeration: `Subscriber.modes.subscribe` or `Subscriber.modes.psubscribe`. Defaults to `Subscriber.modes.psubscribe`.
  * `options.callback` – (Optional) Fired when connection completes
  
Note: instead of creating your own instance of this class, you can use `redisService.getSubscriber(channels, [options])` or `redisService.getPatternSubscriber(channelPatterns)` to get a new subscriber instance.

### `subscriber.unsubscribe([channels], [callback])`
Unsubscribes from the given channels or all channels if empty.
* `channels` – Array of channels to unsubscribe from. If not present, all subscriber channels will be selected.
* `callback(err)` – Optional, function to fire when unsubscribed
* Returns a `Promise`.

For example: 
* `subscriber.unsubscribe()` – Unsub from everything, no callback
* `subscriber.unsubscribe(channels)` – Unsub from the given channels, no callback
* `subscriber.unsubscribe(callback)` – Unsub from everything, and callback
* `subscriber.unsubscribe(channels, callback)` – Unsub from the given channels and callback

### `subscriber.quit([callback])`
Unsubscribes from all channels and closes the underlying redis connection. Use this when all done with the instance.
* `callback(err)` – Optional, function to fire when shutdown
* Returns a `Promise`.

## Events

### `subscriber.on('subscribe', (event) => { ... })`
Fired when a channel is subscribed to.
* `event.channel` – The channel or pattern subscribed
* `event.count` – The number of active channel listeners

### `subscriber.on('unsubscribe', (event) => { ... })`
Fired when a channel is unsubscrived from.
* `event.channel` – The channel or pattern unsubscribed
* `event.count` – The number of active channel listeners remaining

### `subscriber.on('message', (event) => { ... })`
Fired when a message is received. 
* `event.channel` – The channel the message was received on
* `event.message` – The message (attempted to be parsed by JSON.parse) received
* `event.pattern` – The channel pattern that that received the event, if in psubscribe mode.


## Extending and Contributing 

Our goal is quality-driven development. Please ensure that 100% of the code is covered with testing.

Before contributing pull requests, please ensure that changes are covered with unit tests, and that all are passing. 

### Testing

Before you can run the tests, you'll need a working Redis server. We suggest using docker.

For example:

```bash
docker pull redis:6.2.6
docker run -d -p 6379:6379 redis:6.2.6
```

To run unit tests and code coverage:
```sh
REDIS_HOST=192.168.99.100 REDIS_PORT=6379 npm run report
```

Update the `REDIS_*` environment vars to match your docker host (e.g. host, port, etc)

This will perform:
* Unit tests
* Code coverage report
* Code linting

Sometimes, that's overkill to quickly test a quick change. To run just the unit tests:
 
```sh
npm test
```

or if you have mocha installed globally, you may run `mocha test` instead.
