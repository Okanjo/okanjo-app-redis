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