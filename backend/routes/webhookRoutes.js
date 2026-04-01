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

router.get('/paystack', (req, res) => res.status(200).json({ ok: true }));
router.get('/monnify', (req, res) => res.status(200).json({ ok: true }));
router.get('/smeplug', (req, res) => res.status(200).json({ ok: true }));
router.get('/payvessel', (req, res) => res.status(200).json({ ok: true }));
router.get('/billstack', (req, res) => res.status(200).json({ ok: true }));

router.head('/paystack', (req, res) => res.sendStatus(200));
router.head('/monnify', (req, res) => res.sendStatus(200));
router.head('/smeplug', (req, res) => res.sendStatus(200));
router.head('/payvessel', (req, res) => res.sendStatus(200));
router.head('/billstack', (req, res) => res.sendStatus(200));

module.exports = router;
