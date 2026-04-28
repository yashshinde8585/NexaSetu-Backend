const Team = require('../../models/Team');

class ScopeResolver {
  async getScopedTeams(userId) {
    // Determine which teams the user is a part of
    const teams = await Team.find({ members: userId });
    return teams.map(t => t._id);
  }

  async canAccessResource(userId, resourceTeamId) {
    const scopedTeams = await this.getScopedTeams(userId);
    return scopedTeams.some(id => id.toString() === resourceTeamId.toString());
  }
}

module.exports = new ScopeResolver();
