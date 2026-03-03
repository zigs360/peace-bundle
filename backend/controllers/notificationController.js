const Notification = require('../models/Notification');
const notificationRealtimeService = require('../services/notificationRealtimeService');
const { Op } = require('sequelize');

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

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Broadcast notification
// @route   POST /api/notifications/broadcast
// @access  Private (Admin)
const broadcastNotification = async (req, res) => {
  try {
    const { title, message, type, priority, link } = req.body;
    
    const notification = await notificationRealtimeService.broadcast({
      title,
      message,
      type: type || 'broadcast',
      priority: priority || 'medium',
      link
    });

    res.status(201).json({
      success: true,
      message: 'Broadcast sent successfully',
      data: notification
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Send targeted notification
// @route   POST /api/notifications/targeted
// @access  Private (Admin)
const sendTargetedNotification = async (req, res) => {
  try {
    const { userIds, title, message, type, priority, link } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ success: false, message: 'Please provide an array of userIds' });
    }

    await notificationRealtimeService.sendBulk(userIds, {
      title,
      message,
      type: type || 'info',
      priority: priority || 'medium',
      link
    });

    res.status(201).json({
      success: true,
      message: `Notifications sent to ${userIds.length} users`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  broadcastNotification,
  sendTargetedNotification
};
