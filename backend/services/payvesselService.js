const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class PayVesselService {
    constructor() {
        this.apiKey = process.env.PAYVESSEL_API_KEY;
        this.secretKey = process.env.PAYVESSEL_SECRET_KEY;
        this.businessId = process.env.PAYVESSEL_BUSINESS_ID;
        // The standard endpoint for v2 is /pms/api/external/request/customerReservedAccount/
        this.baseUrl = process.env.PAYVESSEL_BASE_URL || 'https://api.payvessel.com/pms/api/external/request/customerReservedAccount/';
    }

    /**
     * Create/Register Virtual Account for a user
     * @param {Object} user - User instance (email, name, phone)
     * @param {number} retryCount - Current retry attempt
     * @returns {Promise<Object>} - Account details
     */
    async createVirtualAccount(user, retryCount = 0) {
        try {
            if (!user.email || !user.name || !user.phone) {
                throw new Error('User details (email, name, phone) are required for virtual account creation');
            }

            // Sanitise Name: Only ASCII characters, convert to UPPERCASE as required by PayVessel
            // Remove any characters that are not letters, spaces, or hyphens
            const fullName = (user.name || '').trim().replace(/[^a-zA-Z\s-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 50);
            
            // Normalize phone number to 11 digits (080...) as seen in PayVessel docs
            let phone = user.phone.trim();
            if (phone.startsWith('234')) {
                phone = '0' + phone.substring(3);
            } else if (!phone.startsWith('0')) {
                phone = '0' + phone;
            }

            const payload = {
                email: user.email,
                name: fullName.toUpperCase(),
                phoneNumber: phone,
                bankcode: ["120001", "000014", "100004"], // 9PSB, Fidelity, Opay
                account_type: "STATIC",
                businessid: this.businessId
            };

            // Add BVN if present
            if (user.bvn) {
                payload.bvn = user.bvn;
            }

            logger.info(`[PayVessel] Initiating virtual account creation for ${user.email}`, {
                url: this.baseUrl,
                payload: { ...payload, businessid: '***', bvn: payload.bvn ? '***' : undefined }
            });

            const response = await axios.post(
                this.baseUrl,
                payload,
                {
                    headers: {
                        'api-key': this.apiKey,
                        'api-secret': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
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
            if (retryCount < 3 && (!status || status >= 500)) {
                const delay = Math.pow(2, retryCount) * 1500; // Exponential backoff: 1.5s, 3s, 4.5s
                logger.info(`[PayVessel] Transient failure, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.createVirtualAccount(user, retryCount + 1);
            }

            throw new Error(`PayVessel Error: ${errorData?.message || error.message}`);
        }
    }

    /**
     * Update Virtual Account with BVN
     * @param {string} trackingReference - The tracking reference from creation
     * @param {string} bvn - User BVN
     * @returns {Promise<Object>} - Updated account details
     */
    async updateAccountBvn(trackingReference, bvn) {
        try {
            const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
            const url = `${base}/virtual-account/update-bvn/${trackingReference}`;
            
            const response = await axios.post(
                url,
                { bvn, business_id: this.businessId },
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
            logger.error('PayVessel Update BVN Error:', error.response?.data || error.message);
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
