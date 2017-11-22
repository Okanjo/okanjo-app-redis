"use strict";

const should = require('should');

describe('Governor', () => {

    const RedisService = require('../RedisService'),
        Governor = require('../Governor'),
        OkanjoApp = require('okanjo-app'),
        config = require('./config');

    let app, governor;

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

    it('should instantiate', () => {
        governor = new Governor(app.services.redis, config.testGovernor);
        governor.should.be.instanceof(Governor);
    });

    it('can be instantiated without options', () => {
        let gov = new Governor(app.services.redis);
        gov.should.be.instanceof(Governor);
    });

    describe('runTask', () => {

        it('should run a limited number of tasks in parallel', function(done) {
            this.timeout(5000);

            let activeTasks = 0;
            let tasksCompleted = 0;
            let tasksToRun = 10;

            const task = (unlock, lock, w, i) => {
                should(unlock).be.a.Function();
                should(lock).be.ok();

                // Increment how many tasks are currently active. We should not have exceeded our limit
                activeTasks++;
                activeTasks.should.be.lessThanOrEqual(2);

                // console.log(`Started task: ${i} (active: ${activeTasks}, worker: ${w}, lock: ${lock.resource})`);

                setTimeout(() => {
                    activeTasks--;
                    unlock();
                }, 250);
            };

            for (let i = 0; i < tasksToRun; i++) {
                ((i) => {
                    setImmediate(() => governor.runTask((unlock, lock, w) => {
                        task(unlock, lock, w, i);
                    }, (err) => {
                        // console.log(`Finishd task: ${i}`);
                        should(err).not.be.ok();
                        tasksCompleted++;
                        tasksCompleted.should.be.lessThanOrEqual(tasksToRun);
                        if (tasksCompleted === tasksToRun) {
                            setTimeout(done, 100); // redlock needs a bit to catch up and clean locks i think
                        }
                    }));
                })(i);
            }
        });

        it('should pass a user error if a user task fails', function(done) {
            this.timeout(5000);

            let activeTasks = 0;
            let tasksCompleted = 0;
            let tasksToRun = 4;

            const task = (unlock, lock, w, i) => {
                should(unlock).be.a.Function();
                should(lock).be.ok();

                // Increment how many tasks are currently active. We should not have exceeded our limit
                activeTasks++;
                activeTasks.should.be.lessThanOrEqual(2);

                // console.log(`Started task: ${i} (active: ${activeTasks}, worker: ${w}, lock: ${lock.resource})`);

                setTimeout(() => {
                    activeTasks--;
                    unlock(i === 3 ? new Error('User error') : null);
                }, 250);
            };

            for (let i = 0; i < tasksToRun; i++) {
                ((i) => {
                    setImmediate(() => governor.runTask((unlock, lock, w) => {
                        task(unlock, lock, w, i);
                    }, (err) => {
                        // console.log(`Finishd task: ${i}`);
                        if (i === 3) {
                            should(err).be.ok();
                        } else {
                            should(err).not.be.ok();
                        }
                        tasksCompleted++;
                        tasksCompleted.should.be.lessThanOrEqual(tasksToRun);
                        if (tasksCompleted === tasksToRun) {
                            setTimeout(done, 100); // redlock needs a bit to catch up and clean locks i think
                        }
                    }));
                })(i);
            }
        });

    });



});