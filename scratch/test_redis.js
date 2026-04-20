const Redis = require('ioredis');
const redisUrl = 'redis://127.0.0.1:6379';

console.log('Testing Redis connection to:', redisUrl);

const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 5,
    connectTimeout: 10000
});

client.on('connect', () => {
    console.log('CONNECTED to Redis');
});

client.on('ready', () => {
    console.log('Redis is READY');
    client.ping().then((res) => {
        console.log('PING result:', res);
        process.exit(0);
    }).catch((err) => {
        console.error('PING failed:', err);
        process.exit(1);
    });
});

client.on('error', (err) => {
    console.error('REDIS ERROR:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('Connection TIMEOUT');
    process.exit(1);
}, 15000);
