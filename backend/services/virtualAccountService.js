const axios = require('axios');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const payvesselService = require('./payvesselService');
const logger = require('../utils/logger');

const { sendSMS, sendTransactionNotification } = require('./notificationService');

class VirtualAccountService {
    constructor() {
        this.monnifyBaseUrl = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';
        this.paystackBaseUrl = 'https://api.paystack.co';
    }

    /**
     * Bulk provisioning for legacy users
     * @param {number} limit - Number of users to process in this batch
     * @returns {Promise<Object>} - Summary of the migration
     */
    async bulkMigrateLegacyUsers(limit = 50) {
        logger.info(`[VirtualAccount] Starting bulk migration for up to ${limit} users.`);
        const users = await User.findAll({
            where: {
                virtual_account_number: null,
                account_status: 'active'
            },
            limit: limit
        });

        const summary = {
            total_found: users.length,
            success: 0,
            failed: 0,
            errors: []
        };

        for (const user of users) {
            try {
                // Use a dedicated transaction per user to ensure partial success doesn't block others
                await sequelize.transaction(async (t) => {
                    await this.assignVirtualAccount(user, { transaction: t });
                    
                    // Notify User
                    try {
                        await this.notifyUserOfNewAccount(user);
                    } catch (notifErr) {
                        logger.warn(`[VirtualAccount] Migration notification failed for ${user.email}: ${notifErr.message}`);
                    }
                });
                summary.success++;
            } catch (err) {
                summary.failed++;
                summary.errors.push({ userId: user.id, email: user.email, error: err.message });
                logger.error(`[VirtualAccount] Migration failed for user ${user.id}: ${err.message}`);
            }
        }

        logger.info(`[VirtualAccount] Migration complete: ${summary.success} succeeded, ${summary.failed} failed.`);
        return summary;
    }

    /**
     * Secure notification for new virtual accounts
     * @param {User} user 
     */
    async notifyUserOfNewAccount(user) {
        const message = `Hello ${user.name || 'User'}, your unique virtual account is now active! \nBank: ${user.virtual_account_bank}\nAccount No: ${user.virtual_account_number}\nName: ${user.virtual_account_name}\nYou can now fund your wallet instantly via bank transfer.`;
        
        // 1. Send SMS (if phone exists)
        if (user.phone) {
            try {
                await sendSMS(user.phone, message);
            } catch (smsErr) {
                logger.error(`[VirtualAccount] SMS notification failed for ${user.id}: ${smsErr.message}`);
            }
        }

        // 2. Send Email/Push via notification service
        try {
            await sendTransactionNotification(user, {
                type: 'virtual_account_activation',
                message: message,
                details: {
                    bank: user.virtual_account_bank,
                    accountNumber: user.virtual_account_number,
                    accountName: user.virtual_account_name
                }
            });
        } catch (emailErr) {
            logger.error(`[VirtualAccount] Email notification failed for ${user.id}: ${emailErr.message}`);
        }
    }

    async getMonnifyToken() {
        const apiKey = await this.getSetting('monnify_api_key');
        const secretKey = await this.getSetting('monnify_secret_key');
        
        if (!apiKey || !secretKey) throw new Error('Monnify keys not configured');

        const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
        
        try {
            const response = await axios.post(`${this.monnifyBaseUrl}/api/v1/auth/login`, {}, {
                headers: { Authorization: `Basic ${auth}` }
            });
            return response.data.responseBody.accessToken;
        } catch (error) {
            console.error('Monnify Auth Error:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Monnify');
        }
    }

    async createMonnifyAccount(user) {
        try {
            const token = await this.getMonnifyToken();
            const contractCode = await this.getSetting('monnify_contract_code');
            
            const response = await axios.post(
                `${this.monnifyBaseUrl}/api/v2/bank-transfer/reserved-accounts`,
                {
                    accountReference: `REF-${user.id}`,
                    accountName: user.name,
                    currencyCode: "NGN",
                    contractCode: contractCode,
                    customerEmail: user.email,
                    customerName: user.name,
                    getAllAvailableBanks: true
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const account = response.data.responseBody;
            return {
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountName: account.accountName
            };
        } catch (error) {
            console.error('Monnify Create Account Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async createPaystackAccount(user) {
        try {
            const secretKey = await this.getSetting('paystack_secret_key');
            if (!secretKey) throw new Error('Paystack secret key not configured');

            const response = await axios.post(
                `${this.paystackBaseUrl}/dedicated_account`,
                {
                    customer: user.email, // Paystack requires customer to be created first, usually email works if existing
                    preferred_bank: "wema-bank" 
                },
                {
                    headers: { Authorization: `Bearer ${secretKey}` }
                }
            );

            const account = response.data.data;
            return {
                accountNumber: account.account_number,
                bankName: account.bank.name,
                accountName: account.account_name
            };
        } catch (error) {
            // If customer doesn't exist, create customer then retry (simplified here)
            console.error('Paystack Create Account Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async assignVirtualAccount(user, options = {}) {
        const { transaction } = options;
        // Prefer PayVessel, fallback to Monnify or others
        try {
            const provider = await this.getSetting('virtual_account_provider') || 'payvessel';
            
            let accountDetails;
            if (provider === 'payvessel') {
                accountDetails = await payvesselService.createVirtualAccount(user);
            } else if (provider === 'monnify') {
                accountDetails = await this.createMonnifyAccount(user);
            } else if (provider === 'paystack') {
                accountDetails = await this.createPaystackAccount(user);
            }

            if (accountDetails) {
                user.virtual_account_number = accountDetails.accountNumber;
                user.virtual_account_bank = accountDetails.bankName;
                user.virtual_account_name = accountDetails.accountName;
                // Store tracking reference for BVN updates if needed
                if (accountDetails.trackingReference) {
                    user.metadata = { ...user.metadata, payvessel_tracking_reference: accountDetails.trackingReference };
                }
                await user.save({ transaction });
                logger.info(`[VirtualAccount] Assigned ${provider} account for user ${user.id}`);
                return accountDetails;
            } else {
                throw new Error(`Provider ${provider} returned no account details`);
            }
        } catch (error) {
            logger.error(`[VirtualAccount] Failed to assign virtual account for user ${user.id}:`, error.message);
            // Re-throw the error to ensure it's handled by the calling function (and triggers a rollback if in a transaction)
            throw error;
        }
    }

    async getSetting(key) {
        const setting = await SystemSetting.findOne({ where: { key } });
        return setting ? setting.value : null; // In prod, consider caching this
    }
}

module.exports = new VirtualAccountService();
