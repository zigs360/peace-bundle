const express = require('express');
const router = express.Router();
const { 
    handlePaystackWebhook, 
    handleMonnifyWebhook, 
    handleSmeplugWebhook,
    handleOgdamsWebhook,
    handlePayvesselWebhook,
    handleBillstackWebhook,
    handleSafehavenWebhook
} = require('../controllers/webhookController');

router.post('/paystack', handlePaystackWebhook);
router.post('/monnify', handleMonnifyWebhook);
router.post('/smeplug', handleSmeplugWebhook);
router.post('/ogdams', handleOgdamsWebhook);
router.post('/payvessel', handlePayvesselWebhook);
router.post('/billstack', handleBillstackWebhook);
router.post('/safehaven', handleSafehavenWebhook);
// Direct alias routes for 9PSB and PalmPay virtual accounts
router.post('/9psb', (req, res, next) => {
    // If request has payvessel headers or structure, route to payvessel; otherwise billstack
    if (req.headers['http_payvessel_http_signature'] || req.headers['payvessel-http-signature'] || req.body?.order) {
        return handlePayvesselWebhook(req, res, next);
    }
    return handleBillstackWebhook(req, res, next);
});
router.post('/palmpay', (req, res, next) => {
    if (req.headers['http_payvessel_http_signature'] || req.headers['payvessel-http-signature'] || req.body?.order) {
        return handlePayvesselWebhook(req, res, next);
    }
    return handleBillstackWebhook(req, res, next);
});

router.get('/paystack', (req, res) => res.status(200).json({ ok: true }));
router.get('/monnify', (req, res) => res.status(200).json({ ok: true }));
router.get('/smeplug', (req, res) => res.status(200).json({ ok: true }));
router.get('/ogdams', (req, res) => res.status(200).json({ ok: true }));
router.get('/payvessel', (req, res) => res.status(200).json({ ok: true }));
router.get('/billstack', (req, res) => res.status(200).json({ ok: true }));
router.get('/safehaven', (req, res) => res.status(200).json({ ok: true }));
router.get('/9psb', (req, res) => res.status(200).json({ ok: true }));
router.get('/palmpay', (req, res) => res.status(200).json({ ok: true }));

router.head('/paystack', (req, res) => res.sendStatus(200));
router.head('/monnify', (req, res) => res.sendStatus(200));
router.head('/smeplug', (req, res) => res.sendStatus(200));
router.head('/ogdams', (req, res) => res.sendStatus(200));
router.head('/payvessel', (req, res) => res.sendStatus(200));
router.head('/billstack', (req, res) => res.sendStatus(200));
router.head('/safehaven', (req, res) => res.sendStatus(200));

module.exports = router;
