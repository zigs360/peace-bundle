const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
    createTicket,
    getUserTickets,
    getAllTickets,
    getTicketById,
    replyToTicket
} = require('../controllers/supportController');

router.route('/')
    .post(protect, createTicket)
    .get(protect, getUserTickets);

router.route('/admin')
    .get(protect, admin, getAllTickets);

router.route('/:id')
    .get(protect, getTicketById);

router.route('/:id/reply')
    .put(protect, replyToTicket);

module.exports = router;