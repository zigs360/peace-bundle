const express = require('express');
const router = express.Router();
const { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  broadcastNotification,
  sendTargetedNotification 
} = require('../controllers/notificationController');
const { protect, admin } = require('../middleware/authMiddleware');

// User routes
router.get('/', protect, getNotifications);
router.put('/read-all', protect, markAllAsRead);
router.put('/:id/read', protect, markAsRead);

// Admin routes
router.post('/broadcast', protect, admin, broadcastNotification);
router.post('/targeted', protect, admin, sendTargetedNotification);

module.exports = router;
