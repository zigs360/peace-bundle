const payvesselService = require('./payvesselService');
const logger = require('../utils/logger');
const axios = require('axios');

class PaymentGatewayService {
    constructor() {
        this.providers = ['payvessel', 'monnify', 'paystack'];
    }

    /**
     * Get active provider from settings with fallback
     */
    async getActiveProvider() {
        // In a real app, fetch this from DB SystemSettings
        // For now, default to payvessel
        return process.env.PRIMARY_PAYMENT_PROVIDER || 'payvessel';
    }

    /**
     * Initialize a payment/checkout
     */
    async initializePayment(user, amount, metadata = {}) {
        const provider = await this.getActiveProvider();
        
        try {
            return await this.executeWithProvider(provider, 'initialize', { user, amount, metadata });
        } catch (error) {
            logger.warn(`Primary provider ${provider} failed, attempting fallback...`);
            // Fallback logic
            for (const fallback of this.providers) {
                if (fallback === provider) continue;
                try {
                    return await this.executeWithProvider(fallback, 'initialize', { user, amount, metadata });
                } catch (err) {
                    continue;
                }
            }
            throw new Error('All payment providers are currently unavailable');
        }
    }

    async executeWithProvider(provider, action, data) {
        switch (provider) {
            case 'payvessel':
                return this.handlePayVessel(action, data);
            case 'paystack':
                return this.handlePaystack(action, data);
            case 'monnify':
                return this.handleMonnify(action, data);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }

    async handlePayVessel(action, { user, amount, metadata }) {
        if (action === 'initialize') {
            // PayVessel typically uses static virtual accounts for funding, 
            // so initialization might just return the user's assigned account.
            return {
                provider: 'payvessel',
                account_number: user.virtual_account_number,
                bank: user.virtual_account_bank,
                instructions: 'Transfer to the account above to fund your wallet'
            };
        }
    }

    async handlePaystack(action, { user, amount, metadata }) {
        if (action === 'initialize') {
            const response = await axios.post('https://api.paystack.co/transaction/initialize', {
                email: user.email,
                amount: amount * 100, // kobo
                metadata
            }, {
                headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
            });
            return {
                provider: 'paystack',
                checkout_url: response.data.data.authorization_url,
                reference: response.data.data.reference
            };
        }
    }

    async handleMonnify(action, { user, amount, metadata }) {
        // Monnify initialization logic...
        return { provider: 'monnify', message: 'Monnify checkout not fully implemented' };
    }
}

module.exports = new PaymentGatewayService();
