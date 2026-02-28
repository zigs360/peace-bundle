const express = require('express');
const router = express.Router();
const {
  createCallPlan,
  getCallPlans,
  getCallPlanById,
  updateCallPlan,
  deleteCallPlan,
  purchaseCallPlan,
} = require('../controllers/callPlanController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getCallPlans);
router.get('/:id', getCallPlanById);

// Private routes (Users)
router.post('/:id/purchase', protect, purchaseCallPlan);

// Admin routes
router.post('/', protect, admin, createCallPlan);
router.put('/:id', protect, admin, updateCallPlan);
router.delete('/:id', protect, admin, deleteCallPlan);

module.exports = router;
