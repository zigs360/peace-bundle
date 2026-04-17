const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/stats', protect, admin, reportController.getSystemStats);
router.get('/chart', protect, admin, reportController.getChartData);
router.get('/airtime-providers', protect, admin, reportController.getAirtimeProviderStats);
router.get('/wallet-reconciliation', protect, admin, reportController.getWalletReconciliationReport);
router.get('/wallet-reconciliation/latest', protect, admin, reportController.getLatestWalletReconciliationReport);

module.exports = router;
