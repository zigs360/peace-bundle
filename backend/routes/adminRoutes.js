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
    refundTransaction,
    getSims,
    approveSim,
    suspendSim,
    getSimAnalytics,
    getKycRequests
} = require('../controllers/adminController');
// const { getAllTransactions } = require('../controllers/transactionController'); // Replaced by admin controller version
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/stats', protect, admin, getAdminStats);
router.get('/transactions', protect, admin, getTransactions);
router.post('/transactions/:id/refund', protect, admin, refundTransaction);

// User Management Routes
router.get('/users', protect, admin, getUsers);
router.get('/users/kyc-requests', protect, admin, getKycRequests);
router.put('/users/:id', protect, admin, updateUser);
router.patch('/users/:id/block', protect, admin, toggleBlockUser);
router.post('/users/:id/fund', protect, admin, fundUserWallet);
router.put('/users/:id/kyc/approve', protect, admin, approveKyc);
router.put('/users/:id/kyc/reject', protect, admin, rejectKyc);

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
router.post('/sims/:id/approve', protect, admin, approveSim);
router.post('/sims/:id/suspend', protect, admin, suspendSim);

module.exports = router;
