const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const crypto = require('crypto');
const Joi = require('joi');
const logger = require('../utils/logger');

class OgdamsService {
    constructor() {
        const sanitizeWrapped = (value) => {
            const raw = String(value ?? '').trim();
            if (!raw) return '';
            const first = raw[0];
            const last = raw[raw.length - 1];
            if ((first === last) && (first === '"' || first === "'" || first === '`') && raw.length >= 2) {
                return raw.slice(1, -1).trim();
            }
            return raw;
        };

        const baseRaw = process.env.OGDAMS_BASE_URL;
        const base = baseRaw ? sanitizeWrapped(baseRaw) : 'https://simhosting.ogdams.ng/api/v1';
        this.baseUrl = String(base).trim().replace(/[\s`"']/g, '').replace(/\/+$/, '');
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

    getApiKey() {
        const key = process.env.OGDAMS_API_KEY;
        if (!key) return null;
        let s = String(key || '').trim();
        if (!s) return null;
        const first = s[0];
        const last = s[s.length - 1];
        if ((first === last) && (first === '"' || first === "'" || first === '`') && s.length >= 2) {
            s = s.slice(1, -1).trim();
        }
        let out = '';
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i);
            if (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) {
                out += s[i];
            }
        }
        const normalized = out.replace(/\s+/g, '');
        return normalized || null;
    }

    getApiKeyFingerprint() {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;
        const digest = crypto.createHash('sha256').update(apiKey).digest('hex');
        return { length: apiKey.length, sha256: digest.slice(0, 12) };
    }

    getAuthStyle() {
        const raw = String(process.env.OGDAMS_AUTH_STYLE || 'bearer').trim().toLowerCase();
        const allowed = new Set(['bearer', 'raw', 'x-api-key', 'both']);
        if (allowed.has(raw)) return raw;
        return 'bearer';
    }

    buildAuthHeaders(apiKey, style) {
        if (!apiKey) return {};
        if (style === 'raw') {
            return { Authorization: apiKey };
        }
        if (style === 'x-api-key') {
            return { 'x-api-key': apiKey };
        }
        if (style === 'both') {
            return { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey };
        }
        return { Authorization: `Bearer ${apiKey}` };
    }

    shouldRetryAuth(error) {
        const responseData = error?.response?.data;
        const message = String(
            responseData?.msg ||
            responseData?.data?.msg ||
            responseData?.message ||
            responseData?.error ||
            error?.message ||
            ''
        ).toLowerCase();
        return message.includes('authoris') || message.includes('authoriz') || message.includes('token') || message.includes('secret/public key');
    }

    async requestWithAuthFallback({ method, url, data, headers = {} }) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            const err = new Error('OGDAMS_API_KEY is not configured');
            err.statusCode = 500;
            throw err;
        }

        const methodLower = String(method || 'get').toLowerCase();
        const maxAuthAttempts = methodLower === 'get' ? 4 : 2;
        const primaryStyle = this.getAuthStyle();
        const attempts = [];
        const tryStyles = [primaryStyle];
        if (primaryStyle !== 'both') tryStyles.push('both');
        if (primaryStyle !== 'bearer') tryStyles.push('bearer');
        if (primaryStyle !== 'x-api-key') tryStyles.push('x-api-key');
        if (primaryStyle !== 'raw') tryStyles.push('raw');

        const seen = new Set();
        for (const style of tryStyles) {
            if (seen.has(style)) continue;
            seen.add(style);
            attempts.push(style);
            const mergedHeaders = {
                ...this.buildAuthHeaders(apiKey, style),
                ...headers,
            };

            try {
                const response = await this.http.request({ method, url, data, headers: mergedHeaders });
                return { response, authStyle: style, apiKeyFingerprint: this.getApiKeyFingerprint() };
            } catch (error) {
                if (!this.shouldRetryAuth(error) || attempts.length >= maxAuthAttempts) {
                    throw Object.assign(error, {
                        __ogdams_auth_attempts: attempts,
                        __ogdams_auth_style: style,
                    });
                }
            }
        }

        const err = new Error('Ogdams request failed');
        err.statusCode = 502;
        throw err;
    }

    async purchaseAirtime(data) {
        const normalized = {
            ...(data && typeof data === 'object' ? data : {}),
            type: (data && typeof data === 'object' && data.type ? data.type : 'VTU'),
        };
        const schema = Joi.object({
            networkId: Joi.number().integer().min(1).max(4).required(),
            amount: Joi.number().integer().min(50).required(),
            phoneNumber: Joi.string().pattern(/^(0\d{10}|234\d{10})$/).required(),
            type: Joi.string().valid('VTU', 'vtu').required(),
            reference: Joi.string().required(),
            sim_number: Joi.string().pattern(/^(0\d{10}|234\d{10})$/).optional(),
        });

        const { error } = schema.validate(normalized);
        if (error) {
            throw new Error(`Invalid payload: ${error.details[0].message}`);
        }

        const airtimePath = String(process.env.OGDAMS_AIRTIME_PATH || '/vend/airtime').trim();
        const url = airtimePath.startsWith('/') ? airtimePath : `/${airtimePath}`;
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

        try {
            const { response, authStyle } = await this.requestWithAuthFallback({ method: 'post', url, data: normalized, headers });
            logger.info('[OGDAMS] Airtime vend response', {
                reference: normalized.reference,
                status: response.data?.status,
                provider_reference: response.data?.reference || response.data?.data?.reference || null,
                phone: this.maskPhone(normalized.phoneNumber),
                authStyle,
            });
            if (response.data && typeof response.data === 'object') {
                return { ...response.data, httpStatus: response.status };
            }
            return { data: response.data, httpStatus: response.status };
        } catch (error) {
            const status = error.response?.status;
            const responseData = error.response?.data;
            const message = responseData?.data?.msg || responseData?.msg || responseData?.message || responseData?.error || error.message || 'Ogdams API request failed';
            const lower = String(message || '').toLowerCase();
            const isDuplicateReference =
                Number(status) === 424 &&
                (lower.includes('reference exists') || lower.includes('reference') && lower.includes('exists already'));

            const meta = {
                reference: normalized.reference,
                status,
                error: responseData || message,
                phone: this.maskPhone(normalized.phoneNumber),
                baseUrl: this.baseUrl,
                path: url,
                authAttempts: error.__ogdams_auth_attempts || undefined,
                apiKeyFingerprint: this.getApiKeyFingerprint(),
            };
            if (process.env.NODE_ENV === 'test') {
                logger.debug('Ogdams API Error', meta);
            } else {
                logger.error('Ogdams API Error', meta);
            }

            const err = new Error(message);
            err.statusCode = status || 502;
            if (isDuplicateReference) {
                err.code = 'OGDAMS_DUPLICATE_REFERENCE';
            }
            throw err;
        }
    }

    async checkAirtimeStatus(reference) {
        const ref = String(reference || '').trim();
        if (!ref) {
            throw new Error('Reference is required');
        }

        const statusPath = String(process.env.OGDAMS_STATUS_PATH || '/transactions').trim();
        const basePath = statusPath.startsWith('/') ? statusPath : `/${statusPath}`;
        const encodedRef = encodeURIComponent(ref);
        const urls = [
            `${basePath}/${encodedRef}`,
            `${basePath}?ref=${encodedRef}`,
            `${basePath}?reference=${encodedRef}`,
        ];
        if (basePath.endsWith('/transactions')) {
            urls.push(`/transaction/${encodedRef}`);
            urls.push(`/transaction?ref=${encodedRef}`);
            urls.push(`/transaction?reference=${encodedRef}`);
        }

        let lastError = null;
        for (const url of urls) {
            try {
                const { response } = await this.requestWithAuthFallback({
                    method: 'get',
                    url,
                    headers: { Accept: 'application/json' },
                });
                return response.data;
            } catch (error) {
                lastError = error;
                const status = error.response?.status;
                if (status === 404) {
                    continue;
                }
            }
        }

        const status = lastError?.response?.status;
        if (status === 404) return null;
        const responseData = lastError?.response?.data;
        const message =
            responseData?.data?.msg ||
            responseData?.msg ||
            responseData?.message ||
            responseData?.error ||
            lastError?.message ||
            'Ogdams status request failed';
        const err = new Error(message);
        err.statusCode = status || 502;
        throw err;
    }

    async purchaseData(data) {
        const schema = Joi.object({
            networkId: Joi.number().integer().min(1).max(4).required(),
            planCode: Joi.string().min(1).required(),
            phoneNumber: Joi.string().pattern(/^(0\d{10}|234\d{10})$/).required(),
            reference: Joi.string().required(),
            sim_number: Joi.string().pattern(/^(0\d{10}|234\d{10})$/).optional(),
        });

        const { error } = schema.validate(data);
        if (error) {
            throw new Error(`Invalid payload: ${error.details[0].message}`);
        }

        const dataPath = String(process.env.OGDAMS_DATA_PATH || '/vend/data').trim();
        const url = dataPath.startsWith('/') ? dataPath : `/${dataPath}`;
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

        try {
            const { response, authStyle } = await this.requestWithAuthFallback({ method: 'post', url, data, headers });
            logger.info('[OGDAMS] Data vend response', {
                reference: data.reference,
                status: response.data?.status,
                provider_reference: response.data?.reference || response.data?.data?.reference || null,
                phone: this.maskPhone(data.phoneNumber),
                authStyle,
            });
            if (response.data && typeof response.data === 'object') {
                return { ...response.data, httpStatus: response.status };
            }
            return { data: response.data, httpStatus: response.status };
        } catch (error2) {
            const status = error2.response?.status;
            const responseData = error2.response?.data;
            const message = responseData?.data?.msg || responseData?.msg || responseData?.message || responseData?.error || error2.message || 'Ogdams data request failed';
            const lower = String(message || '').toLowerCase();
            const isDuplicateReference =
                Number(status) === 424 &&
                (lower.includes('reference exists') || lower.includes('reference') && lower.includes('exists already'));
            const meta = {
                reference: data.reference,
                status,
                error: responseData || message,
                phone: this.maskPhone(data.phoneNumber),
                baseUrl: this.baseUrl,
                path: url,
                authAttempts: error2.__ogdams_auth_attempts || undefined,
                apiKeyFingerprint: this.getApiKeyFingerprint(),
            };
            if (process.env.NODE_ENV === 'test') {
                logger.debug('Ogdams API Error', meta);
            } else {
                logger.error('Ogdams API Error', meta);
            }
            const err = new Error(message);
            err.statusCode = status || 502;
            if (isDuplicateReference) {
                err.code = 'OGDAMS_DUPLICATE_REFERENCE';
            }
            throw err;
        }
    }

    async checkTransactionStatus(reference) {
        return this.checkAirtimeStatus(reference);
    }

    async probeAuth() {
        const ref = `OGDAMS-PROBE-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const statusPath = String(process.env.OGDAMS_STATUS_PATH || '/transactions').trim();
        const basePath = statusPath.startsWith('/') ? statusPath : `/${statusPath}`;
        const url = `${basePath}/${encodeURIComponent(ref)}`;
        try {
            const { response, authStyle, apiKeyFingerprint } = await this.requestWithAuthFallback({
                method: 'get',
                url,
                headers: { Accept: 'application/json' },
            });
            return {
                ok: true,
                status: response.status,
                authStyle,
                apiKeyFingerprint,
                baseUrl: this.baseUrl,
                path: url,
            };
        } catch (error) {
            const status = error.response?.status || null;
            const responseData = error.response?.data || null;
            const message = responseData?.msg || responseData?.message || responseData?.error || error.message || 'probe failed';
            return {
                ok: false,
                status,
                message,
                error: responseData || message,
                authAttempts: error.__ogdams_auth_attempts || undefined,
                apiKeyFingerprint: this.getApiKeyFingerprint(),
                baseUrl: this.baseUrl,
                path: url,
            };
        }
    }
}

module.exports = new OgdamsService();
