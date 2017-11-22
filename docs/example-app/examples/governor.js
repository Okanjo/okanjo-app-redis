"use strict";

module.exports = (app, callback) => {

    console.log('\nGovernor example');

    // const Governor = require('okanjo-app-redis/Governor');
    const Governor = require('../../../Governor');

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

