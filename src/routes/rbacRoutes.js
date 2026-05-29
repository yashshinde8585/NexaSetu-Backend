const express = require('express');
const router = express.Router();
const rbacController = require('../controllers/rbacController');
const { protect } = require('../middlewares/authMiddleware');
const { checkRole } = require('../services/rbac/permissionGuard');

router.use(protect);

/**
 * @swagger
 * /rbac/roles:
 *   get:
 *     summary: Auto-generated summary for GET /rbac/roles
 *     tags: [Rbac]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/roles', rbacController.getRoles);
/**
 * @swagger
 * /rbac/roles:
 *   post:
 *     summary: Auto-generated summary for POST /rbac/roles
 *     tags: [Rbac]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/roles', checkRole('ADMIN'), rbacController.createRole);
/**
 * @swagger
 * /rbac/roles/{id}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /rbac/roles/{id}
 *     tags: [Rbac]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.patch('/roles/:id', checkRole('ADMIN'), rbacController.updateRole);
/**
 * @swagger
 * /rbac/permissions:
 *   get:
 *     summary: Auto-generated summary for GET /rbac/permissions
 *     tags: [Rbac]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/permissions', rbacController.getPermissions);
/**
 * @swagger
 * /rbac/teams:
 *   get:
 *     summary: Auto-generated summary for GET /rbac/teams
 *     tags: [Rbac]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/teams', rbacController.getTeams);

module.exports = router;
