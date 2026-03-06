const Notification = require('../models/Notification');
const notificationRealtimeService = require('../services/notificationRealtimeService');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// @desc    Get all notifications for current user
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: {
        [Op.or]: [
          { userId: req.user.id },
          { userId: null } // System-wide notifications
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json(notifications);
  } catch (error) {
    logger.error(`[Notification] Fetch error for user ${req.user.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve notifications' 
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({ 
      success: true, 
      message: 'Notification marked as read' 
    });
  } catch (error) {
    logger.error(`[Notification] Mark as read error for user ${req.user.id}, ID ${req.params.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update notification status' 
    });
  }
};

// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { userId: req.user.id, isRead: false } }
    );

    res.json({ 
      success: true, 
      message: 'All notifications marked as read' 
    });
  } catch (error) {
    logger.error(`[Notification] Mark all as read error for user ${req.user.id}: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark all notifications as read' 
    });
  }
};

// @desc    Admin: Broadcast notification
// @route   POST /api/notifications/broadcast
// @access  Private (Admin)
const broadcastNotification = async (req, res) => {
  try {
    const { title, message, type, priority, link } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required for broadcast'
      });
    }

    const notification = await notificationRealtimeService.broadcast({
      title,
      message,
      type: type || 'broadcast',
      priority: priority || 'medium',
      link
    });

    logger.info(`[Notification] Broadcast sent by admin ${req.user.id}: ${title}`);

    res.status(201).json({
      success: true,
      message: 'Broadcast sent successfully',
      data: notification
    });
  } catch (error) {
    logger.error(`[Notification] Broadcast error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send broadcast notification' 
    });
  }
};

// @desc    Admin: Send targeted notification
// @route   POST /api/notifications/targeted
// @access  Private (Admin)
const sendTargetedNotification = async (req, res) => {
  try {
    const { userIds, title, message, type, priority, link } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a non-empty array of userIds' 
      });
    }

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }

    await notificationRealtimeService.sendBulk(userIds, {
      title,
      message,
      type: type || 'info',
      priority: priority || 'medium',
      link
    });

    logger.info(`[Notification] Targeted notifications sent to ${userIds.length} users by admin ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: `Notifications sent successfully to ${userIds.length} users`
    });
  } catch (error) {
    logger.error(`[Notification] Targeted send error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send targeted notifications' 
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  broadcastNotification,
  sendTargetedNotification
};
