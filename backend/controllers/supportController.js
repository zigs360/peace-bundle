const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');

// @desc    Create a new support ticket
// @route   POST /api/support
// @access  Private
const createTicket = async (req, res) => {
    try {
        const { subject, message, priority } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ message: 'Please provide subject and message' });
        }

        const ticket = await SupportTicket.create({
            userId: req.user.id,
            subject,
            message,
            priority: priority || 'medium'
        });

        res.status(201).json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get user tickets
// @route   GET /api/support
// @access  Private
const getUserTickets = async (req, res) => {
    try {
        const tickets = await SupportTicket.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all tickets (Admin)
// @route   GET /api/support/admin
// @access  Private (Admin)
const getAllTickets = async (req, res) => {
    try {
        const tickets = await SupportTicket.findAll({
            include: [{ model: User, as: 'User', attributes: ['name', 'email'] }],
            order: [['createdAt', 'DESC']]
        });
        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get ticket by ID
// @route   GET /api/support/:id
// @access  Private
const getTicketById = async (req, res) => {
    try {
        const ticket = await SupportTicket.findByPk(req.params.id, {
            include: [{ model: User, as: 'User', attributes: ['name', 'email'] }]
        });

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Check ownership if not admin
        if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ message: 'Not authorized' });
        }

        res.json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Reply to ticket (Admin resolves, User adds info - Simplified for now)
// @route   PUT /api/support/:id/reply
// @access  Private
const replyToTicket = async (req, res) => {
    try {
        const { response, status } = req.body;
        const ticket = await SupportTicket.findByPk(req.params.id);

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Check ownership if not admin
        if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // If admin, they can resolve and add admin_response
        if (req.user.role === 'admin') {
            if (response) ticket.admin_response = response;
            if (status) ticket.status = status;
            if (status === 'resolved') ticket.resolved_at = new Date();
        } else {
            // User logic (maybe append to message or separate conversation model later)
            // For now, let's just allow them to update the message if open?
            // Or simpler: User can only create tickets, Admin responds.
            // Let's stick to the model: admin_response is a single field.
            // So this endpoint is mainly for Admin to resolve.
            return res.status(403).json({ message: 'Only admins can reply/resolve currently' });
        }

        await ticket.save();
        res.json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    createTicket,
    getUserTickets,
    getAllTickets,
    getTicketById,
    replyToTicket
};