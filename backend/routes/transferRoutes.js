const express = require('express');
const router = express.Router();
const { getBanks, resolveAccount, initiateTransfer } = require('../controllers/transferController');
const { protect } = require('../middleware/authMiddleware');
const { requireTransactionPinSession } = require('../middleware/transactionPinMiddleware');
const validate = require('../middleware/validationMiddleware');
const { check } = require('express-validator');

router.get('/banks', protect, getBanks);

router.post('/resolve', protect, validate([
    check('bank_code').notEmpty().withMessage('Bank code is required'),
    check('account_number').isLength({ min: 10, max: 10 }).withMessage('Valid 10-digit account number is required')
]), resolveAccount);

router.post('/send', protect, validate([
    check('bank_code').notEmpty().withMessage('Bank code is required'),
    check('account_number').isLength({ min: 10, max: 10 }).withMessage('Valid 10-digit account number is required'),
    check('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero'),
    check('bank_name').notEmpty().withMessage('Bank name is required'),
    check('account_name').notEmpty().withMessage('Account name is required')
]), requireTransactionPinSession('financial'), initiateTransfer);

module.exports = router;
