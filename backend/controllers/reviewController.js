const Review = require('../models/Review');
const User = require('../models/User');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Submit a new review
 * @route   POST /api/reviews
 * @access  Private
 */
const submitReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || !comment) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both rating and comment are required to submit a review' 
      });
    }

    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rating must be a number between 1 and 5' 
      });
    }

    // Check if user already submitted a review
    const existingReview = await Review.findOne({ where: { userId } });
    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already submitted a review for this service' 
      });
    }

    const review = await Review.create({
      userId,
      rating: ratingNum,
      comment,
      status: 'pending' // Admin must approve
    });

    logger.info(`[Review] New review submitted by user ${userId} (Rating: ${ratingNum})`);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully and is awaiting moderation',
      data: review
    });
  } catch (error) {
    logger.error(`[Review] Submission error for user ${req.user.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while submitting your review' 
    });
  }
};

/**
 * @desc    Get approved reviews for homepage
 * @route   GET /api/reviews
 * @access  Public
 */
const getApprovedReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, rating } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { status: 'approved' };
    if (rating) {
      where.rating = parseInt(rating);
    }

    const { count, rows } = await Review.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['name', 'avatar']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        limit: parseInt(limit),
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`[Review] Public fetch error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve reviews' 
    });
  }
};

/**
 * @desc    Get current user's reviews
 * @route   GET /api/reviews/me
 * @access  Private
 */
const getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: reviews
    });
  } catch (error) {
    logger.error(`[Review] User fetch error for user ${req.user.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve your reviews' 
    });
  }
};

/**
 * @desc    Admin: Get all reviews for moderation
 * @route   GET /api/reviews/admin
 * @access  Private (Admin)
 */
const getAllReviewsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) {
      where.status = status;
    }

    const { count, rows } = await Review.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['name', 'email']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`[Review] Admin fetch error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve reviews for admin' 
    });
  }
};

/**
 * @desc    Admin: Update review status (approve/reject)
 * @route   PUT /api/reviews/:id/status
 * @access  Private (Admin)
 */
const updateReviewStatus = async (req, res) => {
  try {
    const { status, rejectionReason, isFeatured } = req.body;
    const review = await Review.findByPk(req.params.id);

    if (!review) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found' 
      });
    }

    if (status) review.status = status;
    if (rejectionReason) review.rejectionReason = rejectionReason;
    if (isFeatured !== undefined) review.isFeatured = isFeatured;

    await review.save();
    logger.info(`[Review] Status updated for review ${req.params.id} by admin ${req.user.id}: ${status || 'metadata updated'}`);

    res.json({
      success: true,
      message: `Review updated successfully to status: ${status || 'updated'}`,
      data: review
    });
  } catch (error) {
    logger.error(`[Review] Update error for ID ${req.params.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update review status' 
    });
  }
};

/**
 * @desc    Mark review as helpful
 * @route   POST /api/reviews/:id/helpful
 * @access  Public
 */
const markHelpful = async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found' 
      });
    }

    review.helpfulCount += 1;
    await review.save();

    res.json({ 
      success: true, 
      message: 'Marked as helpful',
      helpfulCount: review.helpfulCount 
    });
  } catch (error) {
    logger.error(`[Review] Helpful count error for ID ${req.params.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark review as helpful' 
    });
  }
};

module.exports = {
  submitReview,
  getApprovedReviews,
  getMyReviews,
  getAllReviewsAdmin,
  updateReviewStatus,
  markHelpful
};
