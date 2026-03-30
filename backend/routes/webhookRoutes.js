const express = require('express');
const router = express.Router();
const { 
    handlePaystackWebhook, 
    handleMonnifyWebhook, 
    handleSmeplugWebhook,
    handlePayvesselWebhook,
    handleBillstackWebhook
} = require('../controllers/webhookController');

router.post('/paystack', handlePaystackWebhook);
router.post('/monnify', handleMonnifyWebhook);
router.post('/smeplug', handleSmeplugWebhook);
router.post('/payvessel', handlePayvesselWebhook);
router.post('/billstack', handleBillstackWebhook);

module.exports = router;
