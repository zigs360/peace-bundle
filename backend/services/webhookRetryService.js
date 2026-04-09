const logger = require('../utils/logger');
const WebhookEvent = require('../models/WebhookEvent');
const WebhookEventService = require('./webhookEventService');

class WebhookRetryService {
    constructor() {
        this.maxRetries = 3;
        this.retryDelays = [1000, 5000, 15000]; // ms
    }

    /**
     * Process a webhook with retries
     * @param {string} eventId 
     * @param {Function} processFn 
     * @param {Object} args 
     */
    async processWithRetry(eventId, processFn, args, options = {}) {
        const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : this.maxRetries;
        const retryDelays = Array.isArray(options.retryDelays) ? options.retryDelays : this.retryDelays;
        let attempt = 0;
        let lastError = null;

        while (attempt <= maxRetries) {
            try {
                const result = await processFn(args);
                if (result && result.ok) {
                    return result;
                }
                // If result.ok is false but no error was thrown, it's a permanent failure (e.g. user not found)
                return result;
            } catch (error) {
                lastError = error;
                attempt++;
                
                if (attempt <= maxRetries) {
                    const delay = retryDelays[attempt - 1] ?? 30000;
                    logger.warn(`[WebhookRetry] Attempt ${attempt} failed for event ${eventId}. Retrying in ${delay}ms... Error: ${error.message}`);
                    
                    await WebhookEventService.markFailed(eventId, { error: `Attempt ${attempt} failed: ${error.message}` });
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        logger.error(`[WebhookRetry] All ${maxRetries + 1} attempts failed for event ${eventId}. Final error: ${lastError.message}`);
        await WebhookEventService.markFailed(eventId, { error: `All retries failed: ${lastError.message}` });
        return { ok: false, reason: 'max_retries_exceeded', error: lastError.message };
    }
}

module.exports = new WebhookRetryService();
