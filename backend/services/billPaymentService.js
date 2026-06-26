const billStackService = require('./billStackService');
const smeplugService = require('./smeplugService');
const SystemSetting = require('../models/SystemSetting');
const logger = require('../utils/logger');

const parseProvider = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  return v;
};

class BillPaymentService {
  async getProvider() {
    const setting = await SystemSetting.get('bill_payment_provider');
    const fromSetting = parseProvider(setting);
    const fromEnv = parseProvider(process.env.BILL_PAYMENT_PROVIDER);
    return fromSetting || fromEnv || 'smeplug';
  }

  async validateCustomer(billType, provider, account, meterType) {
    const selected = await this.getProvider();

    if (selected === 'billstack' && billStackService.isConfigured()) {
      if (billType === 'power') return billStackService.validateElectricityCustomer(provider, account, meterType);
      return billStackService.validateCableCustomer(provider, account);
    }

    let result;
    if (billType === 'power') {
      result = await smeplugService.validateElectricityCustomer(provider, account, meterType || 'Prepaid');
      if (!result.success && billStackService.isConfigured()) {
        logger.warn('[BillPayment] Smeplug validation failed, falling back to BillStack', { error: result.error });
        return billStackService.validateElectricityCustomer(provider, account, meterType);
      }
      return result;
    } else {
      result = await smeplugService.validateCableCustomer(provider, account);
      if (!result.success && billStackService.isConfigured()) {
        logger.warn('[BillPayment] Smeplug validation failed, falling back to BillStack', { error: result.error });
        return billStackService.validateCableCustomer(provider, account);
      }
      return result;
    }
  }

  async payBill(billType, provider, account, amount, phone, meterType, plan) {
    const selected = await this.getProvider();

    if (selected === 'billstack' && billStackService.isConfigured()) {
      if (billType === 'power') return billStackService.payElectricity(provider, account, amount, meterType, phone);
      return billStackService.payCable(provider, account, amount, phone, plan);
    }

    let result;
    if (billType === 'power') {
      result = await smeplugService.payElectricity(provider, account, amount, meterType || 'Prepaid', phone);
      if (!result.success && billStackService.isConfigured()) {
        logger.warn('[BillPayment] Smeplug payment failed, falling back to BillStack', { error: result.error });
        return billStackService.payElectricity(provider, account, amount, meterType, phone);
      }
      return result;
    } else {
      result = await smeplugService.payCable(provider, account, amount, phone, plan);
      if (!result.success && billStackService.isConfigured()) {
        logger.warn('[BillPayment] Smeplug payment failed, falling back to BillStack', { error: result.error });
        return billStackService.payCable(provider, account, amount, phone, plan);
      }
      return result;
    }
  }
}

module.exports = new BillPaymentService();

