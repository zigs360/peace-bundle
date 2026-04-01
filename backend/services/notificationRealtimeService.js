const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set of socketIds
  }

  /**
   * Initialize Socket.io with Express server
   */
  init(server) {
    const allowedOrigins = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const origin =
      process.env.NODE_ENV === 'production' && allowedOrigins.length
        ? allowedOrigins
        : process.env.FRONTEND_URL || '*';
    this.io = new Server(server, {
      cors: {
        origin,
        methods: ['GET', 'POST'],
        credentials: true
      },
      allowEIO3: true // Support older clients if necessary
    });

    // Authentication middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        socket.userId = decoded.id;
        next();
      } catch (err) {
        return next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.userId;
      
      // Register user socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);
      
      logger.info(`User ${userId} connected to notification socket. Active sockets: ${this.userSockets.get(userId).size}`);

      socket.on('disconnect', () => {
        if (this.userSockets.has(userId)) {
          this.userSockets.get(userId).delete(socket.id);
          if (this.userSockets.get(userId).size === 0) {
            this.userSockets.delete(userId);
          }
        }
        logger.info(`User ${userId} disconnected from notification socket`);
      });
    });

    logger.info('Notification Real-time System Initialized');
  }

  /**
   * Send notification to a specific user
   */
  async sendToUser(userId, data) {
    try {
      const { title, message, type = 'info', priority = 'low', link = null, metadata = null } = data;

      // Persist notification
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        priority,
        link,
        metadata
      });

      // Send real-time if user is online
      if (this.io && this.userSockets.has(userId)) {
        this.io.to(Array.from(this.userSockets.get(userId))).emit('notification', notification);
        logger.info(`Real-time notification sent to user ${userId}`);
      }

      return notification;
    } catch (error) {
      logger.error(`Failed to send notification to user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Broadcast notification to all connected users
   */
  async broadcast(data) {
    try {
      const { title, message, type = 'broadcast', priority = 'medium', link = null, metadata = null } = data;

      // Persist for all users (system-wide)
      const notification = await Notification.create({
        userId: null, // Global notification
        title,
        message,
        type,
        priority,
        link,
        metadata
      });

      // Send real-time to everyone
      if (this.io) {
        this.io.emit('notification', notification);
        logger.info('Broadcast notification sent to all online users');
      }

      return notification;
    } catch (error) {
      logger.error(`Failed to broadcast notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send to multiple specific users (Bulk)
   */
  async sendBulk(userIds, data) {
    const promises = userIds.map(userId => this.sendToUser(userId, data));
    return Promise.all(promises);
  }
}

// Singleton instance
module.exports = new NotificationService();
