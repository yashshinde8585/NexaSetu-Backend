const Invitation = require('../models/Invitation');
const crypto = require('crypto');
const User = require('../models/User');

exports.inviteUser = async (req, res) => {
  try {
    const { email, role, projectId } = req.body;
    if (!email || !role) return res.status(400).json({ status: 'fail', message: 'Missing fields' });

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ status: 'fail', message: 'User already has an account' });

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Create invitation (upsert if exists)
    const invitation = await Invitation.findOneAndUpdate(
      { email },
      { 
        role, 
        projectId, 
        workspaceId: req.user.workspaceId, 
        token, 
        invitedBy: req.user._id, 
        status: 'pending', 
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
      },
      { upsert: true, new: true, runValidators: true }
    );

    // In a real app, send an email here.

    res.status(200).json({
      status: 'success',
      data: {
        invitation: {
          email: invitation.email,
          role: invitation.role,
          token: invitation.token // Sending for dev/testing
        }
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getInviteByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const invitation = await Invitation.findOne({ token, status: 'pending', expiresAt: { $gt: Date.now() } });
    
    if (!invitation) return res.status(404).json({ status: 'fail', message: 'Invalid or expired invitation' });

    res.status(200).json({
      status: 'success',
      data: {
        invitation: {
          email: invitation.email,
          role: invitation.role,
          projectId: invitation.projectId
        }
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.inviteMultipleUsers = async (req, res) => {
  try {
    const { invites } = req.body;
    if (!invites || !Array.isArray(invites) || invites.length === 0) return res.status(400).json({ status: 'fail', message: 'No invitations provided' });

    const results = [];
    const errors = [];

    for (const invite of invites) {
      try {
        const { email, role, projectId } = invite;
        if (!email || !role) throw new Error('Missing fields');

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) throw new Error('User already has an account');

        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');
        
        // Create invitation (upsert if exists)
        await Invitation.findOneAndUpdate(
          { email },
          { 
            role, 
            projectId, 
            workspaceId: req.user.workspaceId, 
            token, 
            invitedBy: req.user._id, 
            status: 'pending', 
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
          },
          { upsert: true, new: true, runValidators: true }
        );

        results.push({ email, token }); // In dev, we send the token back for testing/demonstration.
      } catch (err) {
        errors.push({ email: invite.email, message: err.message });
      }
    }

    res.status(200).json({ status: 'success', data: { sent: results, failed: errors } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getWorkspaceTeam = async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const members = await User.find({ workspaceId }).select('name email role createdAt');
    const invitations = await Invitation.find({ workspaceId, status: 'pending', expiresAt: { $gt: Date.now() } }).select('email role expiresAt');

    res.status(200).json({ status: 'success', data: { members, invitations } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};
