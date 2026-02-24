const virtualAccountService = require('../services/virtualAccountService');
const notificationService = require('../services/notificationService');

// Mock Virtual Account Service to prevent external API calls
jest.spyOn(virtualAccountService, 'createMonnifyAccount').mockResolvedValue({
    accountNumber: '1234567890',
    bankName: 'Mock Bank',
    accountName: 'Mock User'
});

jest.spyOn(virtualAccountService, 'assignVirtualAccount').mockImplementation(async (user) => {
    // Mimic success but without API call
    return {
        accountNumber: '1234567890',
        bankName: 'Mock Bank',
        accountName: user.name
    };
});

// Mock Notification Service
jest.spyOn(notificationService, 'sendTransactionNotification').mockResolvedValue(true);
jest.spyOn(notificationService, 'sendSMS').mockResolvedValue(true);

// Mock Console Error to suppress expected errors during tests if necessary
// But since we mocked the services, the errors shouldn't happen!
