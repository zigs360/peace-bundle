const nock = require('nock');
const payvesselService = require('../services/payvesselService');

describe('payvesselService', () => {
    let originalState;

    beforeAll(() => {
        if (typeof payvesselService.createVirtualAccount.mockRestore === 'function') {
            payvesselService.createVirtualAccount.mockRestore();
        }
    });

    beforeEach(() => {
        originalState = {
            apiKey: payvesselService.apiKey,
            secretKey: payvesselService.secretKey,
            businessId: payvesselService.businessId,
            baseUrl: payvesselService.baseUrl,
        };

        payvesselService.apiKey = 'pv_test_key';
        payvesselService.secretKey = 'pv_test_secret';
        payvesselService.businessId = 'pv_test_business';
    });

    afterEach(() => {
        nock.cleanAll();
        payvesselService.apiKey = originalState.apiKey;
        payvesselService.secretKey = originalState.secretKey;
        payvesselService.businessId = originalState.businessId;
        payvesselService.baseUrl = originalState.baseUrl;
    });

    it('uses the documented API path when PAYVESSEL_BASE_URL is host-only', async () => {
        payvesselService.baseUrl = payvesselService.normalizeBaseUrl('https://sandbox.payvessel.com');

        nock('https://sandbox.payvessel.com', {
            reqheaders: {
                'api-key': 'pv_test_key',
                'api-secret': 'pv_test_secret',
                'content-type': 'application/json',
            },
        })
            .post('/pms/api/external/request/customerReservedAccount/', (body) => {
                expect(body.bankcode).toEqual(['120001']);
                expect(body.businessid).toBe('pv_test_business');
                return true;
            })
            .reply(200, {
                status: true,
                banks: [
                    {
                        bankCode: '120001',
                        bankName: '9Payment Service Bank',
                        accountNumber: '5030200545',
                        accountName: 'Demo User',
                        trackingReference: 'PV-TRACK-001',
                    },
                ],
            });

        const result = await payvesselService.createVirtualAccount({
            email: 'demo@example.com',
            name: 'Demo User',
            phone: '08012345678',
            bvn: '12345678901',
        }, 0, {
            preferredBankName: '9PSB',
            bankNames: ['9PSB'],
            maxRetries: 0,
        });

        expect(result).toMatchObject({
            accountNumber: '5030200545',
            bankName: '9Payment Service Bank',
            accountName: 'Demo User',
            trackingReference: 'PV-TRACK-001',
            providerBankCode: '120001',
        });
    });

    it('preserves provider metadata on 404 responses', async () => {
        payvesselService.baseUrl = payvesselService.normalizeBaseUrl('https://api.payvessel.com/pms/api/external/request');

        nock('https://api.payvessel.com')
            .post('/pms/api/external/request/customerReservedAccount/')
            .reply(404, { message: 'Request failed with status code 404' });

        await expect(payvesselService.createVirtualAccount({
            email: 'demo@example.com',
            name: 'Demo User',
            phone: '08012345678',
            bvn: '12345678901',
        }, 0, {
            preferredBankName: '9PSB',
            bankNames: ['9PSB'],
            maxRetries: 0,
        })).rejects.toMatchObject({
            message: 'PayVessel Error: Request failed with status code 404',
            status: 404,
            provider: 'payvessel',
        });
    });
});
