const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/stats', protect, admin, reportController.getSystemStats);
router.get('/chart', protect, admin, reportController.getChartData);

module.exports = router;
