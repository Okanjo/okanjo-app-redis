const should = require('should');
const Util = require('util');

describe('RedisService', function() {

    const RedisService = require('../RedisService'),
        OkanjoApp = require('okanjo-app'),
        config = require('./config');
    let app;

    // Init
    before(function(done) {

        // Create the app instance
        app = new OkanjoApp(config);

        // Add the redis service to the app
        app.services = {
            redis: new RedisService(app)
        };

        // Connect to redis
        app.connectToServices(done);
    });

    it('should be bound to app', function () {
        app.services.redis.should.be.an.Object();
        app.services.redis.should.be.instanceof(RedisService);
    });

    it('should construct with a callback after app started', (done) => {
        new RedisService(app, app.config.redis, done)
    });

    it('should construct with a callback before app started', (done) => {
        const app2 = new OkanjoApp(config);
        new RedisService(app2, app2.config.redis, done);
        app2.connectToServices(() => {});
    });

    it('should do basic i/o properly', function(done) {

        const redis = app.services.redis.redis,
            key = 'unit_test_basic';

        // The key should not be set
        redis.get(key, function(err, val) { // GET key -> (nil)
            should(err).not.be.ok();
            should(val).not.be.ok();

            // Set the key
            redis.setex(key, 10, "i can has value?", function(err, val) {
                should(err).not.be.ok();
                should(val).be.equal('OK'); // SETEX key ttl value -> OK

                // Delete they key
                redis.del(key, function(err, val) { // DEL key -> 1
                    should(err).not.be.ok();
                    should(val).be.exactly(1);

                    done();
                });

            });


        })

    });

    it('can getOrSet properly', function(done) {

        const redis = app.services.redis,
            key = 'unit_test_getOrSet_cache_key';

        redis.getOrSet(
            // Cache key
            key,

            // Not set closure
            (callback) => {
                // callback(err, obj, ttl_in_ms);
                callback(undefined, { ok: true, val: 1 }, 50);
            },

            // Done
            (err, obj, cached) => {
                should(err).not.be.ok();
                obj.should.deepEqual({ ok: true, val: 1 });
                cached.should.be.exactly(false); // First time around should not be cached


                //
                // Now do it again, it should be cached
                //

                redis.getOrSet(
                    // Cache key
                    key,

                    // Not set closure
                    () => {
                        // callback(err, obj, ttl_in_ms);
                        throw new Error("Should not have fired set closure, should be cached");
                    },

                    // Done
                    (err, obj, cached) => {
                        should(err).not.be.ok();
                        obj.should.deepEqual({ ok: true, val: 1 });
                        cached.should.be.exactly(true); // First time around should not be cached


                        //
                        // Now wait until after it should expire, and check again, it should reset
                        //

                        setTimeout(() => {

                            redis.getOrSet(
                                // Cache key
                                key,

                                // Not set closure
                                (callback) => {
                                    // callback(err, obj, ttl_in_ms);
                                    callback(undefined, { ok: true, val: 2 }, 50);
                                },

                                // Done
                                (err, obj, cached) => {
                                    should(err).not.be.ok();
                                    obj.should.deepEqual({ok: true, val: 2 });
                                    cached.should.be.exactly(false); // First time around should not be cached

                                    done();
                                }
                            );

                        }, 50);

                    }
                );
            }
        );

    });

    it('can getOrSet properly (async)', async () => {

        const redis = app.services.redis,
            key = 'unit_test_getOrSet_cache_key2';

        const obj = await redis.getOrSet(
            // Cache key
            key,

            // Not set closure
            (callback) => {
                // callback(err, obj, ttl_in_ms);
                callback(undefined, { ok: true, val: 1 }, 50);
            }
        );

        obj.should.deepEqual({ ok: true, val: 1 });

        const obj2 = await redis.getOrSet(
            // Cache key
            key,

            // Not set closure
            (callback) => {
                // callback(err, obj, ttl_in_ms);
                callback(undefined, { ok: true, val: 2 }, 50);
            }
        );

        obj2.should.deepEqual(obj);

    });

    it('should handle getOrSet cancellation', function(done) {

        const redis = app.services.redis,
            key = 'unit_test_getOrSet_error_cache_key';

        redis.getOrSet(
            // Cache key
            key,

            // Not set closure
            (callback) => {
                // callback(err, obj, ttl_in_ms);
                callback(new Error("Nope, don't set this"), { ok: true, val: 2 }, 50);
            },

            // Done
            (err, obj, cached) => {
                should(err).be.instanceOf(Error);
                err.message.should.match(/Nope/);
                should(obj).not.be.ok();
                cached.should.be.exactly(false); // First time around should not be cached

                done();
            }
        );

    });

    it('should handle getOrSet cancellation (async)', async () => {

        const redis = app.services.redis,
            key = 'unit_test_getOrSet_error_cache_key2';

        try {
            await redis.getOrSet(
                // Cache key
                key,

                // Not set closure
                (callback) => {
                    // callback(err, obj, ttl_in_ms);
                    callback(new Error("Nope, don't set this"), {ok: true, val: 2}, 50);
                }
            );
            // noinspection ExceptionCaughtLocallyJS
            throw new Error('SHOULD NOT HAVE GOTTEN HERE');
        } catch (err) {
            should(err).be.instanceOf(Error);
            err.message.should.match(/Nope/);
        }

    });

    it('should handle setting undefined', function(done) {
        const redis = app.services.redis,
            key = 'unit_test_getOrSet_undefined_cache_key';

        redis.getOrSet(
            // Cache key
            key,

            // Not set closure
            (callback) => {
                // callback(err, obj, ttl_in_ms);
                callback(null, undefined, 50);
            },

            // Done
            (err, obj, cached) => {
                should(err).not.be.ok();
                should(obj).be.exactly(undefined);
                cached.should.be.exactly(false); // First time around should not be cached

                redis.getOrSet(
                    // Cache key
                    key,

                    // Not set closure
                    (callback) => {
                        // should fire this again since we never set a value
                        callback(null, undefined, 50);
                    },

                    // Done
                    (err, obj, cached) => {
                        should(err).not.be.ok();
                        should(obj).be.exactly(undefined);
                        cached.should.be.exactly(false); // Second time around should still not be cached

                        done();
                    }
                );
            }
        );
    });

    it('should handle json parse issues', function(done) {
        const redis = app.services.redis,
            key = 'unit_test_getOrSet_error_cache_key';

        // Set a key with invalid json
        redis.redis.set(key, "this is not json", 'PX', 50, (err) => {
            should(err).not.be.ok();

            // Now try getOrSet'ing it
            redis.getOrSet(
                // Cache key
                key,

                // Not set closure
                () => {
                    throw new Error('This should not fire');
                },

                // Done
                (err, obj, cached) => {
                    should(err).be.ok();
                    err.should.match(/SyntaxError/);
                    should(obj).be.exactly(undefined);
                    cached.should.be.exactly(false); // First time around should not be cached

                    done();
                }
            );
        });
    });

    it('should handle json parse issues (async)', async () => {
        const redis = app.services.redis,
            key = 'unit_test_getOrSet_error_cache_key2';

        // Set a key with invalid json
        const set = Util.promisify(redis.redis.set.bind(redis.redis));
        await set(key, "this is not json", 'PX', 50);

        try {
            await redis.getOrSet(
                // Cache key
                key,

                // Not set closure
                () => {
                    throw new Error('This should not fire');
                }
            );
            // noinspection ExceptionCaughtLocallyJS
            throw new Error('SHOULD NOT THROW');
        } catch (err) {
            should(err).be.ok();
            err.should.match(/SyntaxError/);
        }
    });

    describe('Wrapped Commands', () => {

        it('should handle wrapped commands', async () => {
            await app.services.redis.set('unit_test_wrapper_key', 'hello there');
            const res = await app.services.redis.get('unit_test_wrapper_key');
            should(res).be.ok();
            res.should.be.exactly('hello there');
        });

    });

    describe('Resource locking', () => {

        it('should work', (done) => {
            app.services.redis.lockResource(
                'account',
                '12345',
                (release, lock) => {
                    release.should.be.ok();
                    lock.should.be.ok();

                    release();
                },
                (err) => {

                    should(err).not.be.ok();

                    done();
                }
            );
        });

        it('should work (async)', async () => {
            await app.services.redis.lockResource(
                'account',
                '12345',
                (release, lock) => {
                    release.should.be.ok();
                    lock.should.be.ok();

                    release();
                }
            );
        });

        it('should be able to make an arbitrary instance', (done) => {

            const locker = app.services.redis.createRedlock({
                driftFactor: 0.01, // the expected clock drift; for more details, see http://redis.io/topics/distlock
                retryCount:  60, // the max number of times Redlock will attempt to lock a resource before erroring
                retryDelay:  1000 // the time in ms between attempts
            });

            app.services.redis.lock(
                locker,
                'account:12345',
                60000,
                (release, lock) => {
                    release.should.be.ok();
                    lock.should.be.ok();

                    release();
                },
                (err) => {
                    should(err).not.be.ok();
                    done();
                }
            );

        });

    });

});