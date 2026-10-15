const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const { connectRedis, getRedisClient, getBullRedisClient } = require('../src/config/redis');

describe('System Health & Infrastructure Diagnostics', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.DB_LOCAL_URI);
    }
    const { redisClient } = await connectRedis();
    if (redisClient.status !== 'ready') {
      await new Promise((resolve) => redisClient.once('ready', resolve));
    }
  });

  afterAll(async () => {
    const redis = getRedisClient();
    const bull = getBullRedisClient();
    if (redis) await redis.quit();
    if (bull) await bull.quit();
    await mongoose.connection.close();
  });

  it('GET /api/health should return HEALTHY status when DB and Redis are connected', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.health).toBeDefined();
    expect(res.body.data.health.database).toBe('UP');
    expect(res.body.data.health.cache).toBe('UP');
    expect(res.body.data.health.status).toBe('HEALTHY');
  });

  it('GET /api/health/integrity should report component health and integrity status', async () => {
    const res = await request(app).get('/api/health/integrity');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.components.database.status).toBe('UP');
    expect(res.body.components.cache.status).toBe('UP');
    expect(res.body.integrity.checksum).toBe('VALID');
  });
});
