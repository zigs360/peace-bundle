const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const Joi = require('joi');
const logger = require('../utils/logger');

class OgdamsService {
    constructor() {
        this.baseUrl = String(process.env.OGDAMS_BASE_URL || 'https://simhosting.ogdams.ng/api/v1').replace(/\/+$/, '');
        const timeoutRaw = Number.parseInt(process.env.OGDAMS_TIMEOUT_MS || '12000', 10);
        this.timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 12000;

        this.http = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeoutMs
        });
        axiosRetry(this.http, {
            retries: 2,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error) => {
                const method = String(error?.config?.method || '').toLowerCase();
                if (method !== 'get') return false;
                return axiosRetry.isNetworkOrIdempotentRequestError(error);
            }
        });
    }

    maskPhone(value) {
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) return null;
        const last3 = digits.slice(-3);
        return `********${last3}`;
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

        const airtimePath = String(process.env.OGDAMS_AIRTIME_PATH || '/vend/airtime').trim();
        const url = airtimePath.startsWith('/') ? airtimePath : `/${airtimePath}`;
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
            const response = await this.http.post(url, data, { headers });
            logger.info('[OGDAMS] Airtime vend response', {
                reference: data.reference,
                status: response.data?.status,
                provider_reference: response.data?.reference || response.data?.data?.reference || null,
                phone: this.maskPhone(data.phoneNumber)
            });
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const responseData = error.response?.data;
            const message = responseData?.message || responseData?.error || error.message || 'Ogdams API request failed';

            const meta = { reference: data.reference, status, error: responseData || message, phone: this.maskPhone(data.phoneNumber) };
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

    async checkAirtimeStatus(reference) {
        const ref = String(reference || '').trim();
        if (!ref) {
            throw new Error('Reference is required');
        }

        const apiKey = process.env.OGDAMS_API_KEY;
        if (!apiKey) {
            const err = new Error('OGDAMS_API_KEY is not configured');
            err.statusCode = 500;
            throw err;
        }

        const statusPath = String(process.env.OGDAMS_STATUS_PATH || '/transactions').trim();
        const basePath = statusPath.startsWith('/') ? statusPath : `/${statusPath}`;
        const url = `${basePath}/${encodeURIComponent(ref)}`;

        try {
            const response = await this.http.get(url, {
                headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
            });
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            if (status === 404) return null;
            const responseData = error.response?.data;
            const message = responseData?.message || responseData?.error || error.message || 'Ogdams status request failed';
            const err = new Error(message);
            err.statusCode = status || 502;
            throw err;
        }
    }
}

module.exports = new OgdamsService();
