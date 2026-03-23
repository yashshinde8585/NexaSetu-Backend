const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) => {
  return jwt.sign({ id: id.toString() }, process.env.JWT_SECRET || 'yoursecretkey', {
    expiresIn: '30d',
  });
};

exports.registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Basic Validation
    if (!name || !email || !password) {
      return res.status(400).json({ status: 'fail', message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ status: 'fail', message: 'Password must be at least 8 characters long' });
    }

    // 2. Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ status: 'fail', message: 'Email already registered' });
    }

    // 3. Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
    });

    // 4. Send response
    res.status(201).json({
      status: 'success',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        token: signToken(user._id),
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate inputs
    if (!email || !password) {
      return res.status(400).json({ status: 'fail', message: 'Email and password are required' });
    }

    // 2. Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // 3. Verify user and password
    if (user && (await user.comparePassword(password))) {
      res.status(200).json({
        status: 'success',
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          token: signToken(user._id),
        },
      });
    } else {
      res.status(401).json({ status: 'fail', message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};
