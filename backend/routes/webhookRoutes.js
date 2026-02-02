const express = require('express');
const router = express.Router();
const { 
    handlePaystackWebhook, 
    handleMonnifyWebhook, 
    handleSmeplugWebhook 
} = require('../controllers/webhookController');

router.post('/paystack', handlePaystackWebhook);
router.post('/monnify', handleMonnifyWebhook);
router.post('/smeplug', handleSmeplugWebhook);

module.exports = router;
