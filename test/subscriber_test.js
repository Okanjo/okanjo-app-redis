const should = require('should');

describe('RedisService', () => {

    const RedisService = require('../RedisService'),
        EventEmitter = require('events').EventEmitter,
        Subscriber = require('../Subscriber'),
        OkanjoApp = require('okanjo-app'),
        config = require('./config');

    let app;

    // Init
    before((done) => {

        // Create the app instance
        app = new OkanjoApp(config);

        // Add the redis service to the app
        app.services = {
            redis: new RedisService(app)
        };

        // Connect to redis
        app.connectToServices(done);
    });

    it('should handle subscribe operations', (done) => {

        const state = {
            channel_name: 'unit.test',
            message: { number: 1, string: "poop" },
            got_subscriber: false,
            got_subscribe_event: false,
            got_message_event: false,
            got_unsubscribe_event: false
        };

        const sub = app.services.redis.getSubscriber([state.channel_name]);

        sub.should.be.instanceOf(Subscriber);
        sub.should.be.instanceOf(EventEmitter);

        state.got_subscriber.should.be.exactly(false);
        state.got_subscribe_event.should.be.exactly(false);
        state.got_message_event.should.be.exactly(false);
        state.got_unsubscribe_event.should.be.exactly(false);
        state.got_subscriber = true;

        sub.isSubscribed().should.be.exactly(false);

        sub.on('subscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(false);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);

            event.channel.should.be.exactly(state.channel_name);
            event.count.should.be.exactly(1);
            sub.isSubscribed().should.be.exactly(true);
            state.got_subscribe_event = true;

            // Send the message
            app.services.redis.publish(state.channel_name, state.message);
        });

        sub.on('message', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);
            state.got_message_event = true;

            event.message.should.deepEqual(state.message);
            event.channel.should.be.exactly(state.channel_name);

            sub.quit((err) => {
                should(err).be.exactly(null);
                state.got_subscriber.should.be.exactly(true);
                state.got_subscribe_event.should.be.exactly(true);
                state.got_message_event.should.be.exactly(true);
                state.got_unsubscribe_event.should.be.exactly(true);

                sub.isSubscribed().should.be.exactly(false);

                done();
            });

        });

        sub.on('unsubscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(true);
            state.got_unsubscribe_event.should.be.exactly(false);

            state.got_unsubscribe_event = true;

            event.channel.should.be.exactly(state.channel_name);
            event.count.should.be.exactly(0);
            sub.isSubscribed().should.be.exactly(false);
        });

    });

    it('should handle subscribe edge cases', (done) => {

        const state = {
            channel_name: 'global',
            message: { number: 1, string: "poop" },
            got_subscriber: false,
            got_subscribe_event: false,
            got_message_event: false,
            got_unsubscribe_event: false
        };

        const sub = app.services.redis.getSubscriber(); // no channel should subscribe to global

        sub.should.be.instanceOf(Subscriber);
        sub.should.be.instanceOf(EventEmitter);

        state.got_subscriber.should.be.exactly(false);
        state.got_subscribe_event.should.be.exactly(false);
        state.got_message_event.should.be.exactly(false);
        state.got_unsubscribe_event.should.be.exactly(false);
        state.got_subscriber = true;

        sub.isSubscribed().should.be.exactly(false);

        sub.on('subscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(false);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);

            event.channel.should.be.exactly(state.channel_name);
            event.count.should.be.exactly(1);
            sub.isSubscribed().should.be.exactly(true);
            state.got_subscribe_event = true;

            // Send the message
            app.services.redis.publish(state.channel_name, state.message);
        });

        sub.on('message', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);
            state.got_message_event = true;

            event.message.should.deepEqual(state.message);
            event.channel.should.be.exactly(state.channel_name);

            sub.quit((err) => {
                should(err).be.exactly(null);
                state.got_subscriber.should.be.exactly(true);
                state.got_subscribe_event.should.be.exactly(true);
                state.got_message_event.should.be.exactly(true);
                state.got_unsubscribe_event.should.be.exactly(true);

                sub.isSubscribed().should.be.exactly(false);

                done();
            });

        });

        sub.on('unsubscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(true);
            state.got_unsubscribe_event.should.be.exactly(false);

            state.got_unsubscribe_event = true;

            event.channel.should.be.exactly(state.channel_name);
            event.count.should.be.exactly(0);
            sub.isSubscribed().should.be.exactly(false);
        });

    });

    it('should handle psubscribe operations', (done) => {

        const state = {
            pattern_name: 'unit.*',
            channel_name: 'unit.test',
            message: { number: 1, string: "poop" },
            got_subscriber: false,
            got_subscribe_event: false,
            got_message_event: false,
            got_unsubscribe_event: false
        };

        const sub = app.services.redis.getPatternSubscriber([state.pattern_name]);

        sub.should.be.instanceOf(Subscriber);
        sub.should.be.instanceOf(EventEmitter);

        state.got_subscriber.should.be.exactly(false);
        state.got_subscribe_event.should.be.exactly(false);
        state.got_message_event.should.be.exactly(false);
        state.got_unsubscribe_event.should.be.exactly(false);
        state.got_subscriber = true;

        sub.isSubscribed().should.be.exactly(false);

        sub.on('subscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(false);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);

            event.channel.should.be.exactly(state.pattern_name);
            event.count.should.be.exactly(1);
            sub.isSubscribed().should.be.exactly(true);
            state.got_subscribe_event = true;

            // Send the message
            app.services.redis.publish(state.channel_name, state.message);
        });

        sub.on('message', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);
            state.got_message_event = true;

            event.message.should.deepEqual(state.message);
            event.channel.should.be.exactly(state.channel_name);
            event.pattern.should.be.exactly(state.pattern_name);

            sub.quit((err) => {
                should(err).be.exactly(null);
                state.got_subscriber.should.be.exactly(true);
                state.got_subscribe_event.should.be.exactly(true);
                state.got_message_event.should.be.exactly(true);
                state.got_unsubscribe_event.should.be.exactly(true);

                sub.isSubscribed().should.be.exactly(false);

                done();
            });

        });

        sub.on('unsubscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(true);
            state.got_unsubscribe_event.should.be.exactly(false);

            state.got_unsubscribe_event = true;

            event.channel.should.be.exactly(state.pattern_name);
            event.count.should.be.exactly(0);
            sub.isSubscribed().should.be.exactly(false);
        });

    });


    it('should handle psubscribe operations with default (all) channels', (done) => {

        const state = {
            pattern_name: '*',
            channel_name: 'unit.test',
            message: { number: 1, string: "poop" },
            got_subscriber: false,
            got_subscribe_event: false,
            got_message_event: false,
            got_unsubscribe_event: false
        };

        const sub = app.services.redis.getPatternSubscriber(); // no channel list, should default ok

        sub.should.be.instanceOf(Subscriber);
        sub.should.be.instanceOf(EventEmitter);

        state.got_subscriber.should.be.exactly(false);
        state.got_subscribe_event.should.be.exactly(false);
        state.got_message_event.should.be.exactly(false);
        state.got_unsubscribe_event.should.be.exactly(false);
        state.got_subscriber = true;

        sub.isSubscribed().should.be.exactly(false);

        sub.on('subscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(false);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);

            event.channel.should.be.exactly(state.pattern_name);
            event.count.should.be.exactly(1);
            sub.isSubscribed().should.be.exactly(true);
            state.got_subscribe_event = true;

            // Send the message
            app.services.redis.publish(state.channel_name, state.message);
        });

        sub.on('message', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(false);
            state.got_unsubscribe_event.should.be.exactly(false);
            state.got_message_event = true;

            event.message.should.deepEqual(state.message);
            event.channel.should.be.exactly(state.channel_name);
            event.pattern.should.be.exactly(state.pattern_name);

            sub.unsubscribe(state.pattern_name, (err) => {
                should(err).be.exactly(null);

                // Should have unsubscribed, but quit will trigger another, so fudge it back
                state.got_unsubscribe_event.should.be.exactly(true);
                state.got_unsubscribe_event = false;

                sub.quit((err) => {
                    should(err).be.exactly(null);
                    state.got_subscriber.should.be.exactly(true);
                    state.got_subscribe_event.should.be.exactly(true);
                    state.got_message_event.should.be.exactly(true);
                    state.got_unsubscribe_event.should.be.exactly(true);

                    sub.isSubscribed().should.be.exactly(false);

                    // this won't do anything
                    sub.unsubscribe();
                    sub.unsubscribe((err) => {
                        should(err).match(/Not connected/);
                        done();
                    });
                });
            });
        });

        sub.on('unsubscribe', (event) => {
            state.got_subscriber.should.be.exactly(true);
            state.got_subscribe_event.should.be.exactly(true);
            state.got_message_event.should.be.exactly(true);
            state.got_unsubscribe_event.should.be.exactly(false);

            state.got_unsubscribe_event = true;

            event.channel.should.be.exactly(state.pattern_name);
            event.count.should.be.exactly(0);
            sub.isSubscribed().should.be.exactly(false);
        });

    });

});