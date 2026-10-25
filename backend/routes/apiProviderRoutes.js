const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getProviders,
  createProvider,
  updateProvider,
  activateProvider,
  deleteProvider,
  syncProviderSims,
  getProviderRoutes,
  updateProviderRoutes,
  testProvider,
  testProviderCustom,
} = require('../controllers/apiProviderController');

// All provider endpoints require Admin access
router.get('/', protect, admin, getProviders);
router.post('/', protect, admin, createProvider);

// Custom granular routing endpoints
router.get('/routes', protect, admin, getProviderRoutes);
router.put('/routes', protect, admin, updateProviderRoutes);

// Test provider connectivity
router.post('/test', protect, admin, testProviderCustom);
router.post('/:id/test', protect, admin, testProvider);

router.put('/:id', protect, admin, updateProvider);
router.post('/:id/activate', protect, admin, activateProvider);
router.delete('/:id', protect, admin, deleteProvider);
router.post('/:id/sync-sims', protect, admin, syncProviderSims);

module.exports = router;
