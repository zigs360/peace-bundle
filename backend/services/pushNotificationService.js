const logger = require('../utils/logger');
const User = require('../models/User');

class PushNotificationService {
    /**
     * Send push notification to a single user
     * @param {string|number} userId 
     * @param {string} title 
     * @param {string} body 
     * @param {Object} [data] 
     */
    async sendPushToUser(userId, title, body, data = {}) {
        try {
            const user = await User.findByPk(userId);
            if (!user) {
                logger.warn(`[PushNotification] User ${userId} not found for push alert`);
                return false;
            }

            const userMeta = user.metadata || {};
            const fcmToken = userMeta.fcmToken;

            if (!fcmToken) {
                logger.info(`[PushNotification] User ${userId} has no registered push token. Skipping FCM push.`);
                return false;
            }

            // High-fidelity stub logging the push parameters
            logger.info(`[PushNotification] SENDING PUSH TO USER ${userId} (${user.email}):`);
            logger.info(`  Token: ${fcmToken}`);
            logger.info(`  Title: ${title}`);
            logger.info(`  Body:  ${body}`);
            if (Object.keys(data).length > 0) {
                logger.info(`  Data:  ${JSON.stringify(data)}`);
            }

            // Real Firebase Messaging SDK would be invoked here:
            // await admin.messaging().send({ token: fcmToken, notification: { title, body }, data });

            return true;
        } catch (error) {
            logger.error(`[PushNotification] Failed to send push to user ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Broadcast push to all registered users
     * @param {string} title 
     * @param {string} body 
     * @param {Object} [data] 
     */
    async broadcastPush(title, body, data = {}) {
        try {
            logger.info(`[PushNotification] BROADCASTING PUSH:`);
            logger.info(`  Title: ${title}`);
            logger.info(`  Body:  ${body}`);

            // Real Firebase Messaging broadcast would be invoked here
            return true;
        } catch (error) {
            logger.error(`[PushNotification] Broadcast push failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = new PushNotificationService();
