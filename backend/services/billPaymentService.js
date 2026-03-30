const billStackService = require('./billStackService');
const smeplugService = require('./smeplugService');
const SystemSetting = require('../models/SystemSetting');

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

    if (billType === 'power') return smeplugService.validateElectricityCustomer(provider, account, meterType || 'Prepaid');
    return smeplugService.validateCableCustomer(provider, account);
  }

  async payBill(billType, provider, account, amount, phone, meterType, plan) {
    const selected = await this.getProvider();

    if (selected === 'billstack' && billStackService.isConfigured()) {
      if (billType === 'power') return billStackService.payElectricity(provider, account, amount, meterType, phone);
      return billStackService.payCable(provider, account, amount, phone, plan);
    }

    if (billType === 'power') return smeplugService.payElectricity(provider, account, amount, meterType || 'Prepaid', phone);
    return smeplugService.payCable(provider, account, amount, phone, plan);
  }
}

module.exports = new BillPaymentService();

