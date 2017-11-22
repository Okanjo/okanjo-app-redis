# Example Application Usage

This is an example for how you can use the various utilities provided in this module, including:
* Using the Governor to limit concurrent tasks across distributed systems
* Using publish/subscribing to send and receive messages across applications or instances
* Using resource locking for distributed locking of a thing 

Run like so, replacing your rabbitmq host for your test server:
```sh
REDIS_HOST=192.168.99.100 REDIS_PORT=6379 node docs/example-app/index.js
```

Replace the values for your test environment.

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