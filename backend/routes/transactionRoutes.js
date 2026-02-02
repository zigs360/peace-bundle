const express = require('express');
const router = express.Router();
const {
    fundWallet,
    buyData,
    buyAirtime,
    payBill,
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
    index,
    exportTransactions
} = require('../controllers/transactionController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/', protect, index);
router.get('/export', protect, exportTransactions);
router.post('/fund', protect, fundWallet);
router.post('/data', protect, buyData);
router.post('/airtime', protect, buyAirtime);
router.post('/bill', protect, payBill);
router.post('/withdraw', protect, withdrawFunds);
router.post('/airtime-cash', protect, airtimeToCash);
router.post('/recharge-card', protect, printRechargeCard);
router.post('/result-checker', protect, checkResult);
router.post('/transfer', protect, transferFunds);
router.post('/bulk-sms', protect, sendBulkSMS);
router.post('/coupon', protect, redeemCoupon);
router.get('/all', protect, admin, getAllTransactions); // Admin only
router.get('/:userId', protect, getTransactions);
router.get('/stats/:userId', protect, getDashboardStats);

module.exports = router;
