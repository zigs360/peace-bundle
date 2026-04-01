const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class PayVesselService {
    constructor() {
        this.apiKey = process.env.PAYVESSEL_API_KEY;
        this.secretKey = process.env.PAYVESSEL_SECRET_KEY;
        this.businessId = process.env.PAYVESSEL_BUSINESS_ID;
        // Base URL for PayVessel External API
        this.baseUrl = process.env.PAYVESSEL_BASE_URL || 'https://api.payvessel.com/pms/api/external/request';
    }

    /**
     * Create/Register Virtual Account for a user
     * @param {Object} user - User instance (email, name, phone)
     * @param {number} retryCount - Current retry attempt
     * @returns {Promise<Object>} - Account details
     */
    async createVirtualAccount(user, retryCount = 0, options = {}) {
        try {
            if (!user.email || !user.name || !user.phone) {
                throw new Error('User details (email, name, phone) are required for virtual account creation');
            }

            // Sanitise Name: Only ASCII characters, convert to UPPERCASE as required by PayVessel
            // Remove any characters that are not letters, spaces, or hyphens
            const fullName = (user.name || '').trim().replace(/[^a-zA-Z\s-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 50);
            
            // Normalize phone number to 11 digits (080...) as seen in PayVessel docs
            const rawPhone = String(user.phone || '').trim();
            const digits = rawPhone.replace(/\D/g, '');
            let phone = digits;
            if (phone.startsWith('234') && phone.length === 13) {
                phone = `0${phone.slice(3)}`;
            }
            if (phone.length === 10 && !phone.startsWith('0')) {
                phone = `0${phone}`;
            }
            if (!/^0\d{10}$/.test(phone)) {
                throw new Error('Invalid Nigerian phone number for PayVessel');
            }

            const url = `${this.baseUrl}/customerReservedAccount/`;
            
            if (!this.apiKey || !this.secretKey || !this.businessId) {
                throw new Error('PayVessel credentials are not configured');
            }

            const payload = {
                email: user.email,
                name: fullName.toUpperCase(),
                phoneNumber: phone,
                bankcode: ["999991", "120001"], // PalmPay, 9PSB
                account_type: "STATIC",
                businessid: this.businessId
            };

            // Add BVN or NIN if present (Required for STATIC accounts)
            if (user.bvn) {
                payload.bvn = user.bvn;
            } else if (user.nin) {
                payload.nin = user.nin;
            } else {
                // Check if we should provide a mock BVN for development
                const SystemSetting = require('../models/SystemSetting');
                const allowMock = await SystemSetting.get('allow_mock_bvn');
                const envAllowsMockBvn = String(process.env.MOCK_BVN_ALLOWED || 'false').toLowerCase() === 'true';
                if (allowMock && envAllowsMockBvn) {
                    payload.bvn = '22222222222'; // Standard mock BVN for PayVessel sandbox
                    logger.info(`[PayVessel] Using mock BVN for ${user.email} as allowed by system settings`);
                }
            }

            logger.info(`[PayVessel] Initiating virtual account creation for ${user.email}`, {
                url,
                payload: { ...payload, bvn: payload.bvn ? '***' : undefined, nin: payload.nin ? '***' : undefined }
            });

            const response = await axios.post(
                url,
                payload,
                {
                    headers: {
                        'api-key': this.apiKey,
                        'api-secret': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000
                }
            );

            logger.info(`[PayVessel] Response received for ${user.email}:`, response.data);

            if (response.data && (response.data.status === true || response.data.status === 'success' || response.data.code === 200)) {
                // Response can have banks at top level or under data.banks
                const banks = response.data.banks || response.data.data?.banks;
                
                if (!banks || (Array.isArray(banks) && banks.length === 0)) {
                    // Sometimes it's a single bank object instead of an array
                    if (response.data.accountNumber) {
                        return {
                            accountNumber: response.data.accountNumber,
                            bankName: response.data.bankName,
                            accountName: response.data.accountName,
                            trackingReference: response.data.trackingReference
                        };
                    }
                    throw new Error('PayVessel: Success response but no bank accounts returned');
                }

                const primaryBank = Array.isArray(banks) ? banks[0] : banks;
                
                return {
                    accountNumber: primaryBank.accountNumber || primaryBank.account_number,
                    bankName: primaryBank.bankName || primaryBank.bank_name,
                    accountName: primaryBank.accountName || primaryBank.account_name,
                    trackingReference: primaryBank.trackingReference || primaryBank.tracking_reference
                };
            } else {
                const errorMsg = response.data.message || response.data.error || 'Unknown error from PayVessel';
                throw new Error(errorMsg);
            }
        } catch (error) {
            const errorData = error.response?.data;
            const status = error.response?.status;
            
            logger.error(`[PayVessel] Virtual Account Creation Failed for ${user.email}:`, {
                status,
                data: errorData,
                message: error.message
            });

            // Retry for transient errors (5xx, timeouts, or 503 Service Unavailable)
            const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 3;
            if (retryCount < maxRetries && (!status || status >= 500)) {
                const delay = Math.pow(2, retryCount) * 1500; // Exponential backoff: 1.5s, 3s, 4.5s
                logger.info(`[PayVessel] Transient failure, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.createVirtualAccount(user, retryCount + 1, options);
            }

            throw new Error(`PayVessel Error: ${errorData?.message || error.message}`);
        }
    }

    async createVirtualAccountForUserId(userId, options = {}) {
        const User = require('../models/User');
        const user = await User.findByPk(userId);
        if (!user) throw new Error('User not found');
        return this.createVirtualAccount(user, 0, { timeoutMs: options.timeoutMs, maxRetries: 0 });
    }

    /**
     * Update Virtual Account with BVN
     * @param {string} accountNumber - The virtual account number to update
     * @param {string} bvn - User BVN
     * @returns {Promise<Object>} - Updated account details
     */
    async updateAccountBvn(accountNumber, bvn) {
        try {
            const url = `${this.baseUrl}/virtual-account/${this.businessId}/${accountNumber}/`;
            
            const response = await axios.post(
                url,
                { bvn },
                {
                    headers: {
                        'api-key': this.apiKey,
                        'api-secret': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.status) {
                return response.data;
            } else {
                throw new Error(response.data.message || 'Failed to update BVN with PayVessel');
            }
        } catch (error) {
            logger.error(`[PayVessel] Update BVN Error for account ${accountNumber}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Verify PayVessel Webhook Signature
     * @param {Object} payload - The request body
     * @param {string} signature - The HTTP_PAYVESSEL_HTTP_SIGNATURE header
     * @returns {boolean}
     */
    verifySignature(payload, signature) {
        if (!signature) return false;
        
        const hash = crypto.createHmac('sha512', this.secretKey)
            .update(JSON.stringify(payload))
            .digest('hex');
            
        return hash === signature;
    }
}

module.exports = new PayVesselService();
