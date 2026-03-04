const axios = require('axios');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');
const payvesselService = require('./payvesselService');
const logger = require('../utils/logger');

class VirtualAccountService {
    constructor() {
        this.monnifyBaseUrl = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';
        this.paystackBaseUrl = 'https://api.paystack.co';
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
                return accountDetails;
            }
        } catch (error) {
            logger.error(`Failed to assign virtual account for user ${user.id}:`, error.message);
            // Don't block flow, just log
            return null;
        }
    }

    async getSetting(key) {
        const setting = await SystemSetting.findOne({ where: { key } });
        return setting ? setting.value : null; // In prod, consider caching this
    }
}

module.exports = new VirtualAccountService();
