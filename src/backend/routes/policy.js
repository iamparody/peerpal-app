/**
 * /api/policy — Policy Engine endpoints (Phase 31.4)
 *
 * GET /permission-status/:permissionSlug
 *   Returns the caller's current status for a named permission:
 *   status, reason, action_required, and disclaimer copy.
 *   Used by the frontend training flow and the routing engine.
 */

const router = require('express').Router();
const auth = require('../middleware/auth');
const { getPermissionStatus } = require('../services/policyEngine');

router.use(auth);

// GET /api/policy/permission-status/:permissionSlug
router.get('/permission-status/:permissionSlug', async (req, res) => {
  try {
    const result = await getPermissionStatus(req.user.id, req.params.permissionSlug);
    res.json(result);
  } catch (err) {
    console.error('GET /policy/permission-status', err);
    res.status(500).json({ error: 'Failed to retrieve permission status' });
  }
});

module.exports = router;
