const logger = require('../utils/logger');
const billstackVirtualAccountService = require('./billstackVirtualAccountService');

class BillstackTransferService {
  isConfigured() {
    return billstackVirtualAccountService.isConfigured();
  }

  clientWithTimeout(timeoutMs) {
    return billstackVirtualAccountService.clientWithTimeout(timeoutMs);
  }

  async initiateTransfer({ bankCode, accountNumber, amount, narration, reference }) {
    if (!this.isConfigured()) {
      return { success: false, code: 'not_configured', error: 'BillStack transfer is not configured' };
    }

    const transferPath = String(process.env.BILLSTACK_DISBURSEMENT_INITIATE_PATH || '/disbursement/initiate-transfer');
    const payload = {
      bank_code: bankCode,
      account_number: accountNumber,
      amount,
      narration: narration || 'Peace Bundlle settlement payout',
      reference,
    };

    try {
      const res = await this.clientWithTimeout(parseInt(process.env.BILLSTACK_TIMEOUT_MS || '30000', 10)).post(transferPath, payload);
      const body = res.data || {};
      const ok = body.status === true || body.success === true;
      if (!ok) {
        const msg = body.message || body.error || 'BillStack initiate transfer failed';
        return { success: false, code: 'invalid_response', error: msg, data: body };
      }

      const providerReference =
        body.data?.reference ||
        body.data?.transaction_ref ||
        body.data?.transfer_reference ||
        body.reference ||
        null;

      if (!providerReference) {
        return { success: false, code: 'invalid_response', error: 'BillStack did not return transfer reference', data: body };
      }
      return { success: true, reference: providerReference, data: body };
    } catch (e) {
      const status = e.response?.status;
      const body = e.response?.data;
      const msg = body?.message || body?.error || e.message || 'BillStack initiate transfer failed';
      logger.error('[BillStack] initiateTransfer failed', { status, message: msg });
      return { success: false, code: 'network_error', error: msg, status, data: body || null };
    }
  }
}

module.exports = new BillstackTransferService();
