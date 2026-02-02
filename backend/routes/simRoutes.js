const express = require('express');
const router = express.Router();
const simController = require('../controllers/simController');
const { protect, reseller } = require('../middleware/authMiddleware');
const { check } = require('express-validator');

// Apply protect middleware to all routes
router.use(protect);

// Apply reseller middleware if this is strictly for resellers
// Assuming SIM management is a reseller feature based on previous context
router.use(reseller); 

router.get('/', simController.getSims);

router.post('/', [
    check('phone_number')
        .matches(/^0[7-9][0-1]\d{8}$/).withMessage('Please enter a valid Nigerian phone number'),
    check('provider')
        .optional()
        .isIn(['mtn', 'airtel', 'glo', '9mobile']).withMessage('Invalid provider'),
    check('type')
        .notEmpty().withMessage('Type is required')
        .isIn(['device_based', 'sim_system']).withMessage('Invalid SIM type'),
    check('low_balance_threshold')
        .optional()
        .isFloat({ min: 0 }).withMessage('Must be a positive number'),
    check('notes')
        .optional()
        .isLength({ max: 500 }).withMessage('Notes too long')
], simController.addSim);

router.get('/:id', simController.getSim);

router.put('/:id', [
    check('low_balance_threshold')
        .optional()
        .isFloat({ min: 0 }).withMessage('Must be a positive number'),
    check('notes')
        .optional()
        .isLength({ max: 500 }).withMessage('Notes too long')
], simController.updateSim);

router.delete('/:id', simController.deleteSim);

router.post('/:id/check-balance', simController.checkBalance);

// Keeping getBundles route if frontend relies on it, though implemented as 501
router.get('/:id/bundles', simController.getBundles);

module.exports = router;
