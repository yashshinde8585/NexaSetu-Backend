const config = require('../src/config/config');

describe('Configuration & Production Readiness Tests', () => {
  it('should load application configuration correctly', () => {
    expect(config).toBeDefined();
    expect(config.jwt).toBeDefined();
    expect(config.jwt.secret).toBeDefined();
    expect(config.db).toBeDefined();
    expect(config.redis).toBeDefined();
  });

  it('should enforce encryption key existence and 32-byte length', () => {
    const encKey = process.env.ENCRYPTION_KEY;
    expect(encKey).toBeDefined();
    expect(Buffer.from(encKey).length).toBe(32);
  });

  it('should correctly resolve Redis and Database URLs based on environment', () => {
    if (config.env === 'production') {
      expect(config.db.uri).toBe(process.env.DB_ATLAS_URI);
      expect(config.redis.url).toBe(process.env.REDIS_INTERNAL_URL);
    } else {
      expect(config.db.uri).toBe(process.env.DB_LOCAL_URI);
      expect(config.redis.url).toBe(process.env.REDIS_LOCAL_URL);
    }
  });

  it('should have essential security and jwt expiration settings configured', () => {
    expect(config.jwt.expiresIn).toBeDefined();
    expect(config.jwt.refreshExpiresIn).toBeDefined();
    expect(config.jwt.cookieOptions).toBeDefined();
    expect(config.jwt.cookieOptions.httpOnly).toBe(true);
  });
});
