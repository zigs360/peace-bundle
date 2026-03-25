const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const Joi = require('joi');
const logger = require('../utils/logger');

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

class OgdamsService {
    constructor() {
        this.apiKey = process.env.OGDAMS_API_KEY;
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
        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await axios.post(url, data, { headers, timeout: 30000 });
            logger.info('Ogdams API Response:', { reference: data.reference, response: response.data });
            return response.data;
        } catch (error) {
            logger.error('Ogdams API Error:', { reference: data.reference, error: error.response ? error.response.data : error.message });
            throw error;
        }
    }
}

module.exports = new OgdamsService();
