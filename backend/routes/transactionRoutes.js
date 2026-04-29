const express = require('express');
const router = express.Router();
const {
    fundWallet,
    buyData,
    buyAirtime,
    payBill,
    validateCustomer,
    withdrawFunds,
    airtimeToCash,
    printRechargeCard,
    checkResult,
    transferFunds,
    sendBulkSMS,
    getTransactions,
    getAllTransactions,
    getDashboardStats,
    redeemCoupon,
    initializeFunding,
    index,
    exportTransactions
} = require('../controllers/transactionController');
const { protect, admin } = require('../middleware/authMiddleware');
const { requireTransactionPinSession } = require('../middleware/transactionPinMiddleware');
const validate = require('../middleware/validationMiddleware');
const { check } = require('express-validator');

router.get('/', protect, index);
router.get('/export', protect, exportTransactions);
router.post('/fund/initialize', protect, requireTransactionPinSession('financial'), initializeFunding);
router.post('/fund', protect, validate([
    check('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    check('reference').notEmpty().withMessage('Reference is required')
]), requireTransactionPinSession('financial'), fundWallet);
router.post('/data', protect, validate([
    check('planId').notEmpty().isInt().withMessage('Valid Plan ID is required'),
    check('phone').matches(/^0[7-9][0-1]\d{8}$/).withMessage('Valid phone number is required'),
    check('network').notEmpty().withMessage('Network is required')
]), requireTransactionPinSession('financial'), buyData);
router.post('/airtime', protect, validate([
    check('network').notEmpty().isIn(['mtn', 'airtel', 'glo', '9mobile']).withMessage('Valid Network is required (mtn, airtel, glo, 9mobile)'),
    check('phone').matches(/^0[7-9][0-1]\d{8}$/).withMessage('Valid phone number is required'),
    check('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive')
]), requireTransactionPinSession('financial'), buyAirtime);

router.post('/bill', protect, validate([
    check('billType').isIn(['cable', 'power']).withMessage('Bill Type must be cable or power'),
    check('provider').notEmpty().withMessage('Provider is required'),
    check('smartCardNumber').notEmpty().withMessage('Smart Card/Meter Number is required'),
    check('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    check('phone').matches(/^0[7-9][0-1]\d{8}$/).withMessage('Valid phone number is required')
]), requireTransactionPinSession('financial'), payBill);

router.get('/validate-customer', protect, validate([
    check('billType').isIn(['cable', 'power']).withMessage('Bill Type must be cable or power'),
    check('provider').notEmpty().withMessage('Provider is required'),
    check('account').notEmpty().withMessage('Smart Card/Meter Number is required')
]), validateCustomer);

router.post('/withdraw', protect, validate([
    check('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    check('accountNumber').isNumeric().isLength({ min: 10, max: 10 }).withMessage('Valid 10-digit Account Number is required'),
    check('bankCode').notEmpty().withMessage('Bank Code is required')
]), requireTransactionPinSession('financial'), withdrawFunds);

router.post('/transfer', protect, validate([
    check('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    check('recipientEmail').isEmail().withMessage('Valid Recipient Email is required')
]), requireTransactionPinSession('financial'), transferFunds);

router.post('/bulk-sms', protect, validate([
    check('senderId').notEmpty().isLength({ max: 11 }).withMessage('Sender ID required (max 11 chars)'),
    check('message').notEmpty().withMessage('Message content is required'),
    check('recipients').notEmpty().withMessage('Recipients list is required')
]), requireTransactionPinSession('financial'), sendBulkSMS);

router.post('/airtime-cash', protect, airtimeToCash);
router.post('/recharge-card', protect, requireTransactionPinSession('financial'), printRechargeCard);
router.post('/result-checker', protect, requireTransactionPinSession('financial'), checkResult);
router.post('/coupon', protect, redeemCoupon);
router.get('/all', protect, admin, getAllTransactions); // Admin only
router.get('/:userId', protect, getTransactions);
router.get('/stats/:userId', protect, getDashboardStats);

module.exports = router;
