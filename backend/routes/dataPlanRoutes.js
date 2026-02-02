const express = require('express');
const router = express.Router();
const { 
    getDataPlans, 
    getAdminDataPlans, 
    createDataPlan, 
    updateDataPlan, 
    deleteDataPlan 
} = require('../controllers/dataPlanController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/', getDataPlans); // Public
router.get('/admin', protect, admin, getAdminDataPlans);
router.post('/', protect, admin, createDataPlan);
router.put('/:id', protect, admin, updateDataPlan);
router.delete('/:id', protect, admin, deleteDataPlan);

module.exports = router;
