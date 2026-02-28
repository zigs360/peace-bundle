const express = require('express');
const router = express.Router();
const { purchaseUnified } = require('../controllers/unifiedPurchaseController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validationMiddleware');
const { check } = require('express-validator');

router.post('/unified', protect, validate([
    check('phone').matches(/^0[7-9][0-1]\d{8}$/).withMessage('Valid phone number is required'),
    check('serviceType').isIn(['airtime', 'data', 'talkmore']).withMessage('Invalid service type'),
    check('network').notEmpty().withMessage('Network is required'),
    check('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    check('planId').optional().notEmpty().withMessage('Plan ID is required for data')
]), purchaseUnified);

module.exports = router;
