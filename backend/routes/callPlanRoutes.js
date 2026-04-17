const express = require('express');
const router = express.Router();
const {
  getVoiceBundles,
  createCallPlan,
  getCallPlans,
  getCallPlanById,
  updateCallPlan,
  deleteCallPlan,
  purchaseCallPlan,
  getCallSubProviders,
  getCallSubBundles,
  purchaseCallSubBundle,
  getMyCallSubHistory,
  adminCallSubAnalytics,
} = require('../controllers/callPlanController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getCallPlans);
router.get('/voice-bundles', getVoiceBundles);
router.get('/call-sub/providers', getCallSubProviders);
router.get('/call-sub/:provider/bundles', getCallSubBundles);
router.get('/:id', getCallPlanById);

// Private routes (Users)
router.post('/:id/purchase', protect, purchaseCallPlan);
router.post('/call-sub/:provider/:id/purchase', protect, purchaseCallSubBundle);
router.get('/call-sub/:provider/history', protect, getMyCallSubHistory);

// Admin routes
router.post('/', protect, admin, createCallPlan);
router.put('/:id', protect, admin, updateCallPlan);
router.delete('/:id', protect, admin, deleteCallPlan);
router.get('/admin/call-sub/:provider/analytics', protect, admin, adminCallSubAnalytics);

module.exports = router;
