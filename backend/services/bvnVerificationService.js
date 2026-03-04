const axios = require('axios');
const SystemSetting = require('../models/SystemSetting');
const logger = require('../utils/logger');

class BvnVerificationService {
    constructor() {
        this.paystackBaseUrl = 'https://api.paystack.co';
        // In a real app, you might use services like Paystack, Monnify, or dedicated ones like YouVerify/VerifyMe
    }

    /**
     * Verify BVN using external service
     * @param {string} bvn - 11 digit BVN
     * @param {Object} userData - User data to match against (optional but recommended)
     * @returns {Promise<boolean>}
     */
    async verifyBvn(bvn, userData = {}) {
        if (!bvn || bvn.length !== 11) {
            throw new Error('Invalid BVN length. BVN must be 11 digits.');
        }

        const isProduction = process.env.NODE_ENV === 'production';
        const useMock = process.env.USE_MOCK_BVN === 'true' || (!isProduction && process.env.USE_MOCK_BVN !== 'false');

        if (useMock) {
            logger.info(`[BVN] Mocking verification for BVN: ${bvn} for user ${userData.firstName} ${userData.lastName}`);
            if (bvn.startsWith('000')) {
                throw new Error('BVN verification failed: BVN does not exist or matches no record.');
            }
            return true;
        }

        // Real Paystack/Monnify implementation
        try {
            const secretKey = await this.getSetting('paystack_secret_key');
            const allowMock = await this.getSetting('allow_mock_bvn');
            
            // If secret key is missing in production but we want to allow mock
            if (!secretKey) {
                if (allowMock === true || allowMock === 'true' || process.env.ALLOW_MOCK_BVN_PROD === 'true') {
                    logger.warn(`[BVN] Paystack key missing in production. Falling back to MOCK verification for BVN: ${bvn}`);
                    return true;
                }
                throw new Error('BVN verification provider not configured (Paystack)');
            }

            // Paystack BVN verification (Requires Business account and permission)
            // Endpoint: POST https://api.paystack.co/bvn/match
            const response = await axios.post(
                `${this.paystackBaseUrl}/bvn/match`,
                {
                    bvn: bvn,
                    account_number: userData.accountNumber, // If available
                    bank_code: userData.bankCode, // If available
                    first_name: userData.firstName,
                    last_name: userData.lastName
                },
                {
                    headers: { Authorization: `Bearer ${secretKey}` }
                }
            );

            return response.data.status && response.data.data.is_blacklisted === false;
        } catch (error) {
            console.error('BVN Verification API Error:', error.response?.data || error.message);
            const errorMsg = error.response?.data?.message || 'BVN verification service unavailable';
            throw new Error(errorMsg);
        }
    }

    async getSetting(key) {
        const setting = await SystemSetting.findOne({ where: { key } });
        return setting ? setting.value : null;
    }
}

module.exports = new BvnVerificationService();
