const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const Joi = require('joi');
const logger = require('../utils/logger');

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

class OgdamsService {
    constructor() {
        this.baseUrl = 'https://simhosting.ogdams.ng/api/v1';
    }

    /**
     * Vend airtime using Ogdams API
     * @param {object} data - The payload for the airtime purchase
     * @returns {Promise<object>} - The response from the API
     */
    async purchaseAirtime(data) {
        const schema = Joi.object({
            networkId: Joi.number().integer().min(1).max(4).required(),
            amount: Joi.number().integer().min(50).required(),
            phoneNumber: Joi.string().pattern(/^[0-9]{11}$/).required(),
            type: Joi.string().valid('VTU').required(),
            reference: Joi.string().required(),
        });

        const { error } = schema.validate(data);
        if (error) {
            throw new Error(`Invalid payload: ${error.details[0].message}`);
        }

        const url = `${this.baseUrl}/vend/airtime`;
        const apiKey = process.env.OGDAMS_API_KEY;
        if (!apiKey) {
            const err = new Error('OGDAMS_API_KEY is not configured');
            err.statusCode = 500;
            throw err;
        }
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await axios.post(url, data, { headers, timeout: 30000 });
            logger.info('Ogdams API Response:', { reference: data.reference, response: response.data });
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const responseData = error.response?.data;
            const message = responseData?.message || responseData?.error || error.message || 'Ogdams API request failed';

            const meta = { reference: data.reference, status, error: responseData || message };
            if (process.env.NODE_ENV === 'test') {
                logger.debug('Ogdams API Error', meta);
            } else {
                logger.error('Ogdams API Error', meta);
            }

            const err = new Error(message);
            err.statusCode = status || 502;
            throw err;
        }
    }
}

module.exports = new OgdamsService();
