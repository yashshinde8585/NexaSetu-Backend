const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Project = require('../models/Project');
const crypto = require('crypto');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const AppError = require('../utils/appError');

// Centralizes workspace administrative flows for provisioning and organizing organizational personnel.
class TeamService {
  async provisionUser(
    { name, email, role, projectId, jobTitle },
    workspaceId,
    invitedBy,
    strategy = 'BIRTH'
  ) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return { status: 'EXISTING', user: existingUser };
    }

    if (strategy === 'BIRTH') {
      const newUser = await User.create({
        name: name || email.split('@')[0],
        email,
        password: email,
        role: role || 'PROJECT_MEMBER',
        jobTitle: jobTitle || 'Software Engineer',
        assignedProjectId: projectId || null,
        workspaceId,
      });

      if (projectId) {
        await Project.findByIdAndUpdate(projectId, {
          $addToSet: { members: newUser._id },
        });
      }

      return { status: 'PROVISIONED', user: newUser };
    } else {
      // Construct securely tokenized invitation vectors for async deployments.
      const token = crypto.randomBytes(32).toString('hex');
      const invitation = await Invitation.findOneAndUpdate(
        { email },
        {
          role,
          projectId,
          workspaceId,
          token,
          invitedBy,
          status: 'pending',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        { upsert: true, returnDocument: 'after' }
      );

      return { status: 'INVITED', invitation };
    }
  }

  async bulkProvision(invites, workspaceId, invitedBy, isStrategicLead) {
    const provisionedUsers = [];
    const failedInvites = [];
    const engineeringRecruiterRoles = ['PROJECT_MEMBER', 'RESTRICTED'];

    for (const invite of invites) {
      try {
        // Force strict authorization constraints across technical personnel delegations.
        if (
          !isStrategicLead &&
          !engineeringRecruiterRoles.includes(invite.role)
        ) {
          throw new Error(
            `Unauthorized role (${invite.role}). Only Engineers and Interns can be recruited by non-admins.`
          );
        }

        const result = await this.provisionUser(
          invite,
          workspaceId,
          invitedBy,
          'BIRTH'
        );

        if (result.status === 'EXISTING') {
          throw new Error('User already has an account');
        }

        provisionedUsers.push({
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          status: 'PROVISIONED',
        });
      } catch (err) {
        failedInvites.push({ email: invite.email, message: err.message });
      }
    }

    return { provisionedUsers, failedInvites };
  }

  async getInviteByToken(token) {
    const invitation = await Invitation.findOne({
      token,
      status: 'pending',
      expiresAt: { $gt: Date.now() },
    });

    if (!invitation) {
      throw new AppError('Invalid or expired invitation', 404);
    }

    return invitation;
  }

  async getWorkspaceTeam(user, isStrategicLead, page = 1, limit = 20) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitValue = parseInt(limit);
    const workspaceId = user.workspaceId;

    let memberQuery = { workspaceId };
    let invitationQuery = {
      workspaceId,
      status: 'pending',
      expiresAt: { $gt: Date.now() },
    };

    if (!isStrategicLead) {
      const authorizedProjects = await Project.find(
        getProjectAccessQuery(user)
      ).select('_id');
      const authorizedProjectIds = authorizedProjects.map((p) => p._id);

      memberQuery.assignedProjectId = { $in: authorizedProjectIds };
      invitationQuery.projectId = { $in: authorizedProjectIds };
    }

    const [members, totalMembers, invitations, totalInvitations] = await Promise.all([
      User.find(memberQuery)
        .select('name email role jobTitle createdAt assignedProjectId')
        .populate('assignedProjectId', 'name')
        .skip(skip)
        .limit(limitValue)
        .sort('name')
        .lean(),
      User.countDocuments(memberQuery),
      Invitation.find(invitationQuery)
        .select('email role expiresAt projectId')
        .populate('projectId', 'name')
        .skip(skip)
        .limit(limitValue)
        .lean(),
      Invitation.countDocuments(invitationQuery),
    ]);

    return {
      members,
      totalMembers,
      invitations,
      totalInvitations,
      page: parseInt(page),
      limit: limitValue
    };
  }
}

module.exports = new TeamService();
