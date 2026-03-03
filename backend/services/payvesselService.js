const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class PayVesselService {
    constructor() {
        this.apiKey = process.env.PAYVESSEL_API_KEY;
        this.secretKey = process.env.PAYVESSEL_SECRET_KEY;
        this.businessId = process.env.PAYVESSEL_BUSINESS_ID;
        this.baseUrl = 'https://api.payvessel.com/pms/api/external/request/virtual-account';
    }

    /**
     * Create/Register Virtual Account for a user
     * @param {Object} user - Sequelize User instance
     * @returns {Promise<Object>} - Account details
     */
    async createVirtualAccount(user) {
        try {
            if (!user.email || !user.name || !user.phone) {
                throw new Error('User details (email, name, phone) are required for virtual account creation');
            }

            const payload = {
                email: user.email,
                name: user.name,
                phoneNumber: user.phone,
                bankCode: ["120001", "000014", "100004"], // 9PSB, Fidelity, Opay (Example list)
                account_type: "STATIC"
            };

            const response = await axios.post(
                `${this.baseUrl}/register`,
                payload,
                {
                    headers: {
                        'api-key': this.apiKey,
                        'api-secret': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.status) {
                const banks = response.data.banks;
                // For simplicity, we pick the first available bank
                const primaryBank = Array.isArray(banks) ? banks[0] : banks;
                
                return {
                    accountNumber: primaryBank.accountNumber,
                    bankName: primaryBank.bankName,
                    accountName: primaryBank.accountName,
                    trackingReference: primaryBank.trackingReference
                };
            } else {
                throw new Error(response.data.message || 'Failed to create virtual account with PayVessel');
            }
        } catch (error) {
            logger.error('PayVessel Create Account Error:', error.response?.data || error.message);
            throw error;
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
            const url = `${this.baseUrl}/${this.businessId}/${trackingReference}/`;
            
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
