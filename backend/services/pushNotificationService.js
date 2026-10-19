const logger = require('../utils/logger');
const User = require('../models/User');
const firebaseManager = require('../config/firebase');

/**
 * Masks sensitive FCM token for safe logging
 * @param {string} token 
 * @returns {string}
 */
function maskToken(token) {
    if (!token || typeof token !== 'string') return 'N/A';
    if (token.length <= 10) return '***';
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

class PushNotificationService {
    constructor() {
        this.firebase = firebaseManager;
    }

    get isInitialized() {
        return this.firebase.isInitialized;
    }

    get messaging() {
        return this.firebase.messaging;
    }

    get mode() {
        return this.firebase.mode;
    }

    /**
     * Get diagnostic health data for administrative monitoring
     */
    getDiagnostics() {
        return this.firebase.getDiagnostics();
    }

    /**
     * Send push notification to a single user
     * @param {string|number} userId 
     * @param {string} title 
     * @param {string} body 
     * @param {Object} [data] 
     * @returns {Promise<boolean>}
     */
    async sendPushToUser(userId, title, body, data = {}) {
        const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

        try {
            const user = await User.findByPk(userId);
            if (!user) {
                logger.warn(`[PushNotification] User ${userId} not found for push alert`);
                return false;
            }

            const userMeta = user.metadata || {};
            const fcmToken = userMeta.fcmToken;

            if (!fcmToken) {
                logger.info(`[PushNotification] User ${userId} (${user.email}) has no registered push token. Skipping FCM push.`);
                return false;
            }

            // Case A: Firebase Admin SDK is initialized
            if (this.firebase.isInitialized && this.firebase.messaging) {
                // If token is a test/mock token
                if (fcmToken.startsWith('mock_fcm_token_')) {
                    if (isProd) {
                        logger.warn(`[PushNotification] Refusing to send real push: user ${userId} has mock FCM token "${maskToken(fcmToken)}".`);
                        this.firebase.recordDelivery('failed');
                        return false;
                    } else {
                        logger.info(`[PushNotification] [SIMULATED] Mock token for user ${userId}: Title="${title}", Body="${body}"`);
                        this.firebase.recordDelivery('simulated');
                        return true;
                    }
                }

                logger.info(`[PushNotification] Sending real FCM push to user ${userId} (${user.email}): "${title}"`);

                // Ensure all data payload values are strings (FCM protocol requirement)
                const stringData = {};
                for (const [key, val] of Object.entries(data)) {
                    if (val === null || val === undefined) continue;
                    stringData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                }

                const message = {
                    token: fcmToken,
                    notification: {
                        title: String(title),
                        body: String(body)
                    },
                    data: stringData,
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: data.channelId || 'peacebundle_payments',
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

                const response = await this.firebase.messaging.send(message);
                this.firebase.recordDelivery('sent');
                logger.info(`[PushNotification] FCM message accepted by Firebase for user ${userId}. Message ID: ${response}`);
                return true;
            }

            // Case B: Firebase is NOT initialized
            if (isProd) {
                logger.error(
                    `[PushNotification] Push failed for user ${userId}: Firebase is unavailable in production (${this.firebase.lastInitError}). Real push disabled.`
                );
                this.firebase.recordDelivery('failed');
                return false;
            } else {
                // Simulation mode in development or test environments
                logger.info(`[PushNotification] [SIMULATED] Development push for user ${userId}: Token=${maskToken(fcmToken)}, Title="${title}", Body="${body}"`);
                this.firebase.recordDelivery('simulated');
                return true;
            }
        } catch (error) {
            this.firebase.recordDelivery('failed');

            // Handle stale or invalid token cleanup automatically
            if (
                error.code === 'messaging/registration-token-not-registered' ||
                error.code === 'messaging/invalid-registration-token'
            ) {
                logger.warn(`[PushNotification] Invalid or expired FCM token detected for user ${userId} (${maskToken(fcmToken)}). Cleaning up user metadata.`);
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
            } else if (error.code === 'messaging/authentication-error') {
                logger.error(`[PushNotification] Firebase authentication error: ${error.message}. Please check service account permissions.`);
            } else {
                logger.error(`[PushNotification] FCM send error for user ${userId} (token: ${maskToken(fcmToken)}): [${error.code || 'UNKNOWN'}] ${error.message}`);
            }

            return false;
        }
    }

    /**
     * Broadcast push to all registered users via topic
     * @param {string} title 
     * @param {string} body 
     * @param {Object} [data] 
     * @returns {Promise<boolean>}
     */
    async broadcastPush(title, body, data = {}) {
        const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

        try {
            logger.info(`[PushNotification] Broadcasting push: "${title}" - "${body}"`);

            if (this.firebase.isInitialized && this.firebase.messaging) {
                const stringData = {};
                for (const [key, val] of Object.entries(data)) {
                    if (val === null || val === undefined) continue;
                    stringData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                }

                const message = {
                    topic: 'peacebundle_announcements',
                    notification: {
                        title: String(title),
                        body: String(body)
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

                const response = await this.firebase.messaging.send(message);
                this.firebase.recordDelivery('sent');
                logger.info(`[PushNotification] Topic broadcast accepted by Firebase. Message ID: ${response}`);
                return true;
            }

            if (isProd) {
                logger.error(`[PushNotification] Broadcast push skipped: Firebase is unavailable in production (${this.firebase.lastInitError}).`);
                this.firebase.recordDelivery('failed');
                return false;
            } else {
                logger.info(`[PushNotification] [SIMULATED] Topic broadcast simulated for ${process.env.NODE_ENV || 'dev'}`);
                this.firebase.recordDelivery('simulated');
                return true;
            }
        } catch (error) {
            this.firebase.recordDelivery('failed');
            logger.error(`[PushNotification] Broadcast push failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Dry run or test verification for admin diagnostic console
     * @param {string} token 
     * @param {boolean} dryRun 
     */
    async testTokenDelivery(token, dryRun = true) {
        if (!this.firebase.isInitialized || !this.firebase.messaging) {
            return {
                success: false,
                error: `Firebase Admin SDK is not initialized: ${this.firebase.lastInitError || 'Missing credentials'}`
            };
        }

        try {
            const message = {
                token,
                notification: {
                    title: 'Peace Bundle Diagnostic Test',
                    body: 'Verification message from Peace Bundle administrative diagnostics'
                },
                data: {
                    type: 'system_diagnostic',
                    timestamp: new Date().toISOString()
                }
            };

            const response = await this.firebase.messaging.send(message, dryRun);
            return {
                success: true,
                dryRun,
                response,
                projectId: this.firebase.projectId
            };
        } catch (error) {
            return {
                success: false,
                code: error.code || 'UNKNOWN',
                message: error.message
            };
        }
    }
}

module.exports = new PushNotificationService();
