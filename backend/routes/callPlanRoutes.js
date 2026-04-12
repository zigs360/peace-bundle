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
  getAirtelTalkMoreBundles,
  purchaseAirtelTalkMoreBundle,
  getMyAirtelTalkMoreHistory,
  adminAirtelTalkMoreAnalytics,
} = require('../controllers/callPlanController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getCallPlans);
router.get('/voice-bundles', getVoiceBundles);
router.get('/airtel-talk-more/bundles', getAirtelTalkMoreBundles);
router.get('/:id', getCallPlanById);

// Private routes (Users)
router.post('/:id/purchase', protect, purchaseCallPlan);
router.post('/airtel-talk-more/:id/purchase', protect, purchaseAirtelTalkMoreBundle);
router.get('/airtel-talk-more/history', protect, getMyAirtelTalkMoreHistory);

// Admin routes
router.post('/', protect, admin, createCallPlan);
router.put('/:id', protect, admin, updateCallPlan);
router.delete('/:id', protect, admin, deleteCallPlan);
router.get('/admin/airtel-talk-more/analytics', protect, admin, adminAirtelTalkMoreAnalytics);

module.exports = router;
