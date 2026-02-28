const express = require('express');
const router = express.Router();
const { 
  submitReview, 
  getApprovedReviews, 
  getMyReviews,
  getAllReviewsAdmin, 
  updateReviewStatus,
  markHelpful 
} = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getApprovedReviews);
router.post('/:id/helpful', markHelpful);

// Private routes (Users)
router.get('/me', protect, getMyReviews);
router.post('/', protect, submitReview);

// Admin routes
router.get('/admin', protect, admin, getAllReviewsAdmin);
router.put('/:id/status', protect, admin, updateReviewStatus);

module.exports = router;
