const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Project = require('../models/Project');
const crypto = require('crypto');

class TeamService {
    async provisionUser({ name, email, role, projectId, jobTitle }, workspaceId, invitedBy, strategy = 'BIRTH') {
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
                workspaceId
            });

            if (projectId) {
                await Project.findByIdAndUpdate(projectId, {
                    $addToSet: { members: newUser._id }
                });
            }

            return { status: 'PROVISIONED', user: newUser };
        } else {
            // Invite Strategy: Generate token-based invitation
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
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
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
                // Validation: Tech Leads can only deploy Engineers and Interns
                if (!isStrategicLead && !engineeringRecruiterRoles.includes(invite.role)) {
                    throw new Error(`Unauthorized role (${invite.role}). Only Engineers and Interns can be recruited by non-admins.`);
                }

                const result = await this.provisionUser(invite, workspaceId, invitedBy, 'BIRTH');
                
                if (result.status === 'EXISTING') {
                   throw new Error('User already has an account');
                }

                provisionedUsers.push({
                    email: result.user.email,
                    name: result.user.name,
                    role: result.user.role,
                    status: 'PROVISIONED'
                });
            } catch (err) {
                failedInvites.push({ email: invite.email, message: err.message });
            }
        }

        return { provisionedUsers, failedInvites };
    }
}

module.exports = new TeamService();
