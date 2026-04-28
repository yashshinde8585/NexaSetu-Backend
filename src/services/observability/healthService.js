const mongoose = require('mongoose');
const os = require('os');

class HealthService {
  async getSystemHealth() {
    const dbStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';
    
    return {
      status: dbStatus === 'UP' ? 'HEALTHY' : 'DEGRADED',
      database: dbStatus,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuLoad: os.loadavg()
    };
  }
}

module.exports = new HealthService();
