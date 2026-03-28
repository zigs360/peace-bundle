const virtualAccountService = require('../services/virtualAccountService');
const notificationService = require('../services/notificationService');
const smeplugService = require('../services/smeplugService');
const payvesselService = require('../services/payvesselService');

// Mock Virtual Account Service to prevent external API calls
jest.spyOn(virtualAccountService, 'createMonnifyAccount').mockResolvedValue({
    accountNumber: '1234567890',
    bankName: 'Mock Bank',
    accountName: 'Mock User'
});

jest.spyOn(payvesselService, 'createVirtualAccount').mockImplementation(async (user) => {
  return {
    accountNumber: '1234567890',
    bankName: 'Mock Bank',
    accountName: user.name,
    trackingReference: `MOCK-REF-${user.id}`,
  };
});

// Mock Notification Service
jest.spyOn(notificationService, 'sendTransactionNotification').mockResolvedValue(true);
jest.spyOn(notificationService, 'sendSMS').mockResolvedValue(true);

jest.spyOn(smeplugService, 'purchaseVTU').mockImplementation(async () => {
  return { success: true, data: { reference: 'MOCK-VTU-REF' } };
});

jest.spyOn(smeplugService, 'purchaseData').mockImplementation(async () => {
  return { success: true, data: { reference: 'MOCK-DATA-REF' } };
});

// Mock Console Error to suppress expected errors during tests if necessary
// But since we mocked the services, the errors shouldn't happen!
