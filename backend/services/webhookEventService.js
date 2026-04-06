const WebhookEvent = require('../models/WebhookEvent');

class WebhookEventService {
  extractHeaders(req) {
    const headers = req?.headers || {};
    const allow = [
      'user-agent',
      'content-type',
      'x-forwarded-for',
      'x-real-ip',
      'x-paystack-signature',
      'monnify-signature',
      'http_payvessel_http_signature',
      'x-billstack-signature',
      'x-wiaxy-signature',
      'x-signature',
      'wiaxy-signature',
    ];
    const out = {};
    for (const key of allow) {
      if (headers[key] !== undefined) out[key] = headers[key];
    }
    return out;
  }

  async recordReceived({ provider, reference, userId = null, amount = null, currency = null, payload = null, req = null }) {
    const rawBody = req?.rawBody && Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('base64') : null;
    const headers = req ? this.extractHeaders(req) : null;
    return WebhookEvent.create({
      provider,
      status: 'received',
      reference: reference || null,
      userId,
      amount,
      currency,
      payload,
      headers,
      raw_body_base64: rawBody,
    });
  }

  async markRejected(eventId, { error, signatureHeader = null, signaturePresent = false }) {
    return WebhookEvent.update(
      {
        status: 'rejected',
        verified: false,
        error: error || null,
        signature_header: signatureHeader,
        signature_present: Boolean(signaturePresent),
        attempts: WebhookEvent.sequelize.literal('"attempts" + 1'),
        last_attempt_at: new Date(),
      },
      { where: { id: eventId } }
    );
  }

  async markVerified(eventId, { signatureHeader = null, signaturePresent = false }) {
    return WebhookEvent.update(
      {
        status: 'verified',
        verified: true,
        signature_header: signatureHeader,
        signature_present: Boolean(signaturePresent),
        attempts: WebhookEvent.sequelize.literal('"attempts" + 1'),
        last_attempt_at: new Date(),
      },
      { where: { id: eventId } }
    );
  }

  async markProcessed(eventId, { userId = null }) {
    return WebhookEvent.update(
      {
        status: 'processed',
        userId: userId || WebhookEvent.sequelize.col('userId'),
        processed_at: new Date(),
      },
      { where: { id: eventId } }
    );
  }

  async markFailed(eventId, { error, userId = null }) {
    return WebhookEvent.update(
      {
        status: 'failed',
        error: error || null,
        userId: userId || WebhookEvent.sequelize.col('userId'),
        attempts: WebhookEvent.sequelize.literal('"attempts" + 1'),
        last_attempt_at: new Date(),
      },
      { where: { id: eventId } }
    );
  }
}

module.exports = new WebhookEventService();

