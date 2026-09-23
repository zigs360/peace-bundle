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
} = require('../controllers/apiProviderController');

// All provider endpoints require Admin access
router.get('/', protect, admin, getProviders);
router.post('/', protect, admin, createProvider);
router.put('/:id', protect, admin, updateProvider);
router.post('/:id/activate', protect, admin, activateProvider);
router.delete('/:id', protect, admin, deleteProvider);
router.post('/:id/sync-sims', protect, admin, syncProviderSims);

module.exports = router;
