const express = require('express');
const router = express.Router();
const { 
    handlePaystackWebhook, 
    handleMonnifyWebhook, 
    handleSmeplugWebhook,
    handlePayvesselWebhook
} = require('../controllers/webhookController');

router.post('/paystack', handlePaystackWebhook);
router.post('/monnify', handleMonnifyWebhook);
router.post('/smeplug', handleSmeplugWebhook);
router.post('/payvessel', handlePayvesselWebhook);

module.exports = router;
