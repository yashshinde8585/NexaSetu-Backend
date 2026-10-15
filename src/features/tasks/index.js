const taskService = require('../../services/taskService');
const taskController = require('../../controllers/taskController');

module.exports = {
  service: taskService,
  controller: taskController,
};
