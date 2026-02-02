const express = require('express');
const router = express.Router();
const { 
    getBeneficiaries, 
    createBeneficiary, 
    deleteBeneficiary 
} = require('../controllers/beneficiaryController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getBeneficiaries)
    .post(protect, createBeneficiary);

router.route('/:id')
    .delete(protect, deleteBeneficiary);

module.exports = router;