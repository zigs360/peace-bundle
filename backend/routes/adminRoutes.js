const express = require('express');
const router = express.Router();
const { 
    getAdminStats, 
    updateUser, 
    toggleBlockUser, 
    fundUserWallet,
    getSystemSettings,
    updateSystemSettings,
    getUsers,
    approveKyc,
    rejectKyc,
    getDataPlans,
    createDataPlan,
    updateDataPlan,
    deleteDataPlan,
    getTransactions,
    getWebhookEvents,
    getWebhookMetrics,
    refundTransaction,
    getSims,
    approveSim,
    suspendSim,
    deleteSim,
    connectSim,
    disconnectSim,
    checkSimBalance,
    syncSmeplugSims,
    getSimAnalytics,
    getKycRequests,
    bulkProcessKyc,
    getBulkSMSHistory,
    sendAdminBulkSMS,
    generateMissingVirtualAccounts,
    upgradeBillstackVirtualAccount,
    retryUserVirtualAccount,
    getVirtualAccountHealth,
    getReferralAnalytics,
    viewKycDocument,
    listPendingFundingReviews,
    approvePendingFundingReview,
    rejectPendingFundingReview
} = require('../controllers/adminController');
const {
    adminGetSubscriptionPlans,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan
} = require('../controllers/subscriptionPlanController');
// const { getAllTransactions } = require('../controllers/transactionController'); // Replaced by admin controller version
const pricingController = require('../controllers/pricingController');
const treasuryController = require('../controllers/treasuryController');
const {
    listAdminOgdamsSims,
    createAdminOgdamsDataPurchase,
    getAdminOgdamsDataPurchase
} = require('../controllers/adminOgdamsDataPurchaseController');
const { protect, admin } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

const ogdamsAdminPurchaseLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

router.get('/stats', protect, admin, getAdminStats);
router.get('/transactions', protect, admin, getTransactions);
router.get('/webhook-events', protect, admin, getWebhookEvents);
router.get('/webhook-metrics', protect, admin, getWebhookMetrics);
router.post('/transactions/:id/refund', protect, admin, refundTransaction);

// Subscription Plan Routes
router.get('/subscription-plans', protect, admin, adminGetSubscriptionPlans);
router.post('/subscription-plans', protect, admin, createSubscriptionPlan);
router.put('/subscription-plans/:id', protect, admin, updateSubscriptionPlan);
router.delete('/subscription-plans/:id', protect, admin, deleteSubscriptionPlan);

// Bulk SMS Routes
router.get('/bulk-sms', protect, admin, getBulkSMSHistory);
router.post('/bulk-sms', protect, admin, sendAdminBulkSMS);

// User Management Routes
router.get('/users', protect, admin, getUsers);
router.get('/users/kyc-requests', protect, admin, getKycRequests);
router.get('/users/kyc-document/:filename', protect, admin, viewKycDocument);
router.post('/users/kyc/bulk', protect, admin, bulkProcessKyc);
router.put('/users/:id', protect, admin, updateUser);
router.patch('/users/:id/block', protect, admin, toggleBlockUser);
router.post('/users/:id/fund', protect, admin, fundUserWallet);
router.put('/users/:id/kyc/approve', protect, admin, approveKyc);
router.put('/users/:id/kyc/reject', protect, admin, rejectKyc);
router.post('/users/generate-virtual-accounts', protect, admin, generateMissingVirtualAccounts);
router.post('/users/:id/virtual-account/billstack/upgrade', protect, admin, upgradeBillstackVirtualAccount);
router.post('/users/:id/virtual-account/retry', protect, admin, retryUserVirtualAccount);

// System Settings Routes
router.get('/settings', protect, admin, getSystemSettings);
router.put('/settings', protect, admin, updateSystemSettings);

// Data Plan Routes
router.get('/plans', protect, admin, getDataPlans);
router.post('/plans', protect, admin, createDataPlan);
router.put('/plans/:id', protect, admin, updateDataPlan);
router.delete('/plans/:id', protect, admin, deleteDataPlan);

// SIM Oversight Routes
router.get('/sims', protect, admin, getSims);
router.get('/sims/analytics', protect, admin, getSimAnalytics);
router.post('/sims/sync', protect, admin, syncSmeplugSims);
router.post('/sims/:id/approve', protect, admin, approveSim);
router.post('/sims/:id/suspend', protect, admin, suspendSim);
router.delete('/sims/:id', protect, admin, deleteSim);
router.post('/sims/:id/connect', protect, admin, connectSim);
router.post('/sims/:id/disconnect', protect, admin, disconnectSim);
router.post('/sims/:id/check-balance', protect, admin, checkSimBalance);

// Referral Analytics Route
router.get('/referrals/analytics', protect, admin, getReferralAnalytics);
router.get('/virtual-accounts/health', protect, admin, getVirtualAccountHealth);
router.get('/funding/pending-review', protect, admin, listPendingFundingReviews);
router.post('/funding/pending-review/:id/approve', protect, admin, approvePendingFundingReview);
router.post('/funding/pending-review/:id/reject', protect, admin, rejectPendingFundingReview);

router.get('/pricing/tiers', protect, admin, pricingController.listTiers);
router.post('/pricing/tiers', protect, admin, pricingController.createTier);
router.put('/pricing/tiers/:id', protect, admin, pricingController.updateTier);
router.get('/pricing/rules', protect, admin, pricingController.listRules);
router.post('/pricing/rules', protect, admin, pricingController.createRule);
router.put('/pricing/rules/:id', protect, admin, pricingController.updateRule);
router.delete('/pricing/rules/:id', protect, admin, pricingController.deleteRule);
router.get('/pricing/audit', protect, admin, pricingController.listAuditLogs);

router.get('/treasury/balance', protect, admin, treasuryController.getTreasuryBalance);
router.post('/treasury/sync', protect, admin, treasuryController.syncTreasuryRevenue);
router.post('/treasury/withdraw', protect, admin, treasuryController.withdrawTreasuryToSettlement);

router.get('/ogdams/sims', protect, admin, listAdminOgdamsSims);
router.post('/ogdams/data-purchase', protect, admin, ogdamsAdminPurchaseLimiter, createAdminOgdamsDataPurchase);
router.get('/ogdams/data-purchase/:reference', protect, admin, getAdminOgdamsDataPurchase);

module.exports = router;
