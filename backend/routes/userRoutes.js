const express = require('express');
const router = express.Router();
const { 
    getBeneficiaries, 
    addBeneficiary, 
    deleteBeneficiary, 
    getAffiliateStats,
    getApiKey,
    regenerateApiKey,
    requestVirtualAccount,
    getVirtualAccountSummary,
    revealVirtualAccountNumber,
    auditVirtualAccountAccess
} = require('../controllers/userController');
const dataPurchaseController = require('../controllers/dataPurchaseController');
const bulkDataController = require('../controllers/bulkDataController');
const { protect } = require('../middleware/authMiddleware');
const { check } = require('express-validator');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Data Purchase
router.get('/data/purchase', protect, dataPurchaseController.index);
router.post('/data/purchase', [
    protect,
    check('plan_id').exists().withMessage('Plan ID is required'),
    check('recipient_phone').matches(/^0[7-9][0-1]\d{8}$/).withMessage('Please enter a valid Nigerian phone number (e.g., 08012345678)'),
    check('sim_id').optional()
], dataPurchaseController.store);

// Bulk Data
router.get('/data/bulk', protect, bulkDataController.index);
router.post('/data/bulk/upload', protect, upload.single('file'), bulkDataController.upload);

router.get('/affiliate-stats', protect, getAffiliateStats);
router.post('/virtual-account/request', protect, requestVirtualAccount);
router.get('/virtual-account', protect, getVirtualAccountSummary);
router.post('/virtual-account/reveal', protect, revealVirtualAccountNumber);
router.post(
  '/virtual-account/audit',
  [
    protect,
    check('action')
      .isIn(['view_masked', 'reveal_full', 'copy_full'])
      .withMessage('Invalid action')
  ],
  auditVirtualAccountAccess
);
router.get('/apikey', protect, getApiKey);
router.post('/apikey/regenerate', protect, regenerateApiKey);
router.get('/beneficiaries/:userId', protect, getBeneficiaries);
router.post('/beneficiaries', protect, addBeneficiary);
router.delete('/beneficiaries/:userId/:beneficiaryId', protect, deleteBeneficiary);

module.exports = router;
