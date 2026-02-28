const Review = require('../models/Review');
const User = require('../models/User');
const { Op } = require('sequelize');

/**
 * @desc    Submit a new review
 * @route   POST /api/reviews
 * @access  Private
 */
const submitReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const userId = req.user.id;

    // Validation
    if (!rating || !comment) {
      return res.status(400).json({ success: false, message: 'Rating and comment are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Check if user already submitted a review
    const existingReview = await Review.findOne({ where: { userId } });
    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already submitted a review' });
    }

    const review = await Review.create({
      userId,
      rating,
      comment,
      status: 'pending' // Admin must approve
    });

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully and is awaiting moderation',
      data: review
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    const offset = (page - 1) * limit;

    const where = { status: 'approved' };
    if (rating) {
      where.rating = rating;
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
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    const offset = (page - 1) * limit;

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
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (status) review.status = status;
    if (rejectionReason) review.rejectionReason = rejectionReason;
    if (isFeatured !== undefined) review.isFeatured = isFeatured;

    await review.save();

    res.json({
      success: true,
      message: `Review ${status || 'updated'} successfully`,
      data: review
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.helpfulCount += 1;
    await review.save();

    res.json({ success: true, helpfulCount: review.helpfulCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
