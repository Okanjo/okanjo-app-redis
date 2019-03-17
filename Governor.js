"use strict";

// const Async = require('async');

class Governor {

    /**
     * Creates a new Governor instance
     * @param redisService
     * @param options
     */
    constructor(redisService, options) {
        options = options || {};
        this.service = redisService;
        this.maximumConcurrency = options.maximumConcurrency || 2;

        const redlockConfig = options.redlock || {
                driftFactor: 0.01, // the expected clock drift; for more details, see http://redis.io/topics/distlock
                retryCount: 600, // the max number of times Redlock will attempt to lock a resource before erroring
                retryDelay: 100 // the time in ms between attempts
            };

        this.locker = this.service.createRedlock(redlockConfig);
        this.prefix = `${this.service.app.currentEnvironment}:governor:${options.name || 'default'}`;
        this.ttl = options.ttl || 55000; // 55s to complete the task before lock expires
        this._nextWorker = 0;
    }

    /**
     * Increments the worker counter, so we don't brute force the first worker for every new task (round robin attempt)
     * @private
     */
    _updateNextWorker() {
        this._nextWorker++;
        if (this._nextWorker >= this.maximumConcurrency) {
            this._nextWorker = 0;
        }
    }

    //noinspection JSUnusedGlobalSymbols
    /**
     * Runs a task through the governor
     * @param closure
     * @param callback
     */
    runTask(closure, callback) {
        return new Promise((resolve, reject) => {

            // Try to obtain a lock on each concurrency "worker"
            // The first to come through will abort the subsequent locks

            let gotLock = false;
            let calledBack = false;
            let workersCompleted = 0;

            const run = (workerNumber) => {
                let canReply = false;
                this.service.lock(
                    this.locker,
                    `${this.prefix}:worker:${workerNumber}`,
                    this.ttl,
                    (unlock, lock) => {
                        if (!gotLock) {
                            // We're the first to get the lock on this task!
                            gotLock = true;
                            canReply = true;

                            // Pass on the unlock callback/ lock for extensions
                            closure(unlock, lock, workerNumber);
                        } else {
                            // Already locked, abort
                            unlock();
                        }
                    },
                    (err) => {
                        // callback if this worker ran the task or was the last worker to fire (process of elimination)
                        workersCompleted++;
                        if (!calledBack && (canReply || workersCompleted >= this.maximumConcurrency)) {
                            // we're the first to callback, so do that
                            calledBack = true;
                            if (callback) return callback(err);
                            if (err) {
                                return reject(err);
                            } else {
                                return resolve();
                            }
                        }
                        // If already called back, then obviously don't do it again
                    }
                );
            };


            for (let i = 0; i < this.maximumConcurrency; i++) {
                this._updateNextWorker();
                run(this._nextWorker);
            }
        });
    }

}

module.exports = Governor;