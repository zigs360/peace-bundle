const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const logger = require('../utils/logger');

// @desc    Create a new support ticket
// @route   POST /api/support
// @access  Private
const createTicket = async (req, res) => {
    try {
        const { subject, message, priority } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ 
                success: false,
                message: 'Please provide both a subject and a message for your ticket' 
            });
        }

        const ticket = await SupportTicket.create({
            userId: req.user.id,
            subject,
            message,
            priority: priority || 'medium'
        });

        logger.info(`[Support] New ticket created by user ${req.user.id}: ${subject}`);

        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully. Our team will get back to you soon.',
            data: ticket
        });
    } catch (error) {
        logger.error(`[Support] Ticket creation error for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to create support ticket' 
        });
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
        
        res.json({
            success: true,
            data: tickets
        });
    } catch (error) {
        logger.error(`[Support] User fetch error for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve your support tickets' 
        });
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
        
        res.json({
            success: true,
            data: tickets
        });
    } catch (error) {
        logger.error(`[Support] Admin fetch all error: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve all support tickets' 
        });
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
            return res.status(404).json({ 
                success: false,
                message: 'Support ticket not found' 
            });
        }

        // Check ownership if not admin
        if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ 
                success: false,
                message: 'Not authorized to view this ticket' 
            });
        }

        res.json({
            success: true,
            data: ticket
        });
    } catch (error) {
        logger.error(`[Support] Fetch by ID error (${req.params.id}): ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to retrieve ticket details' 
        });
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
            return res.status(404).json({ 
                success: false,
                message: 'Support ticket not found' 
            });
        }

        // Check ownership if not admin
        if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ 
                success: false,
                message: 'Not authorized to reply to this ticket' 
            });
        }

        // If admin, they can resolve and add admin_response
        if (req.user.role === 'admin') {
            if (response) ticket.admin_response = response;
            if (status) ticket.status = status;
            if (status === 'resolved') ticket.resolved_at = new Date();
            
            await ticket.save();
            logger.info(`[Support] Admin ${req.user.id} replied to ticket ${req.params.id}`);

            res.json({
                success: true,
                message: 'Ticket updated successfully',
                data: ticket
            });
        } else {
            // Currently only admins can reply via this endpoint
            return res.status(403).json({ 
                success: false,
                message: 'Currently, only administrators can respond to or resolve tickets.' 
            });
        }
    } catch (error) {
        logger.error(`[Support] Reply error for ticket ${req.params.id}: ${error.message}`);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update support ticket' 
        });
    }
};

module.exports = {
    createTicket,
    getUserTickets,
    getAllTickets,
    getTicketById,
    replyToTicket
};