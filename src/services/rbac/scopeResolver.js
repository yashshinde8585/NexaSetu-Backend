const Team = require('../../models/Team');

const getScopedTeams = async (userId) => {
  // Determine which teams the user is a part of
  const teams = await Team.find({ members: userId });
  return teams.map(t => t._id);
};

const canAccessResource = async (userId, resourceTeamId) => {
  const scopedTeams = await getScopedTeams(userId);
  return scopedTeams.some(id => id.toString() === resourceTeamId.toString());
};

module.exports = {
  getScopedTeams,
  canAccessResource,
};

