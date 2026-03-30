const app = require('./src/app');
const dotenv = require('dotenv');
const connectDB = require('./src/config/db');
const cronService = require('./src/services/cronService');

dotenv.config();

const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB().then(() => {
  cronService.start();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
