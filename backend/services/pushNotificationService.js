const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');
const logger = require('../utils/logger');
const User = require('../models/User');

class PushNotificationService {
    constructor() {
        this.firebaseApp = null;
        this.messaging = null;
        this.isInitialized = false;
        this._initFirebase();
    }

    /**
     * Initializes Firebase Admin SDK from service account credentials
     */
    _initFirebase() {
        try {
            const existingApps = admin.getApps ? admin.getApps() : (admin.apps || []);
            if (existingApps.length > 0) {
                this.firebaseApp = existingApps[0];
                this.messaging = getMessaging(this.firebaseApp);
                this.isInitialized = true;
                return;
            }

            let serviceAccount = null;

            // 1. Try environment variable as JSON string or file path
            if (process.env.FIREBASE_SERVICE_ACCOUNT) {
                try {
                    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                } catch {
                    if (fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT)) {
                        serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, 'utf8'));
                    }
                }
            }

            // 2. Try default config file path
            if (!serviceAccount) {
                const configPath = path.join(__dirname, '..', 'config', 'firebase-service-account.json');
                if (fs.existsSync(configPath)) {
                    serviceAccount = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                }
            }

            if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
                this.firebaseApp = admin.initializeApp({
                    credential: admin.cert(serviceAccount)
                });
                this.messaging = getMessaging(this.firebaseApp);
                this.isInitialized = true;
                logger.info(`[PushNotification] Firebase Admin initialized successfully for project: ${serviceAccount.project_id}`);
            } else {
                logger.warn('[PushNotification] No valid Firebase service account found. Push notifications will operate in simulation mode.');
            }
        } catch (error) {
            logger.error(`[PushNotification] Firebase Admin initialization failed: ${error.message}`);
        }
    }

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

            logger.info(`[PushNotification] Sending push to user ${userId} (${user.email}): "${title}"`);

            // If Firebase is initialized and token is not a mock token, send real FCM message
            if (this.isInitialized && !fcmToken.startsWith('mock_fcm_token_')) {
                // Ensure all data values are strings for FCM payload compatibility
                const stringData = {};
                for (const [key, val] of Object.entries(data)) {
                    stringData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                }

                const message = {
                    token: fcmToken,
                    notification: {
                        title,
                        body
                    },
                    data: stringData,
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: 'peacebundle_payments',
                            sound: 'default',
                            priority: 'max',
                            defaultSound: true,
                            defaultVibrateTimings: true
                        }
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1
                            }
                        }
                    }
                };

                const response = await this.messaging.send(message);
                logger.info(`[PushNotification] FCM message delivered to user ${userId}. Message ID: ${response}`);
                return true;
            } else {
                logger.info(`[PushNotification] [SIMULATED] Sent to user ${userId}: Token=${fcmToken}, Title=${title}, Body=${body}`);
                return true;
            }
        } catch (error) {
            // Handle stale or unregistered token
            if (
                error.code === 'messaging/registration-token-not-registered' ||
                error.code === 'messaging/invalid-registration-token'
            ) {
                logger.warn(`[PushNotification] Removing expired/invalid FCM token for user ${userId}`);
                try {
                    const user = await User.findByPk(userId);
                    if (user && user.metadata && user.metadata.fcmToken) {
                        const updatedMeta = { ...user.metadata };
                        delete updatedMeta.fcmToken;
                        user.metadata = updatedMeta;
                        await user.save();
                    }
                } catch (cleanupErr) {
                    logger.error(`[PushNotification] Failed to clean up invalid token: ${cleanupErr.message}`);
                }
            } else {
                logger.error(`[PushNotification] Failed to send push to user ${userId}: ${error.message}`);
            }
            return false;
        }
    }

    /**
     * Broadcast push to all registered users via topic
     * @param {string} title 
     * @param {string} body 
     * @param {Object} [data] 
     */
    async broadcastPush(title, body, data = {}) {
        try {
            logger.info(`[PushNotification] Broadcasting push: "${title}" - "${body}"`);

            if (this.isInitialized) {
                const stringData = {};
                for (const [key, val] of Object.entries(data)) {
                    stringData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                }

                const message = {
                    topic: 'peacebundle_announcements',
                    notification: {
                        title,
                        body
                    },
                    data: stringData,
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: 'peacebundle_announcements',
                            sound: 'default'
                        }
                    }
                };

                const response = await this.messaging.send(message);
                logger.info(`[PushNotification] Topic broadcast sent. Message ID: ${response}`);
                return true;
            }

            return true;
        } catch (error) {
            logger.error(`[PushNotification] Broadcast push failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = new PushNotificationService();
