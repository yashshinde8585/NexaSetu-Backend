const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ status: 'fail', message: 'Not authorized, no token provided' });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yoursecretkey');

    // 3. Check if user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ status: 'fail', message: 'The user belonging to this token no longer exists' });
    }

    // 4. Grant access
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ status: 'fail', message: 'Not authorized, invalid token' });
  }
};

module.exports = { protect };
