const should = require('should');

describe('RedisService', function() {

    const RedisService = require('../RedisService'),
        OkanjoApp = require('okanjo-app'),
        config = require('./config2');

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


        });

    });

    it('should not have redlock', (done) => {
        const redis = app.services.redis.redis;
        should(redis.redlock).not.be.ok();
        done();
    });

});