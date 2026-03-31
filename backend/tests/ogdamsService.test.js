const OgdamsService = require('../services/ogdamsService');
const nock = require('nock');

describe('OgdamsService', () => {
    beforeAll(() => {
        process.env.OGDAMS_API_KEY = 'test-ogdams-key';
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('should return success when the API call is successful', async () => {
        const response = { status: 'success' };
        nock('https://simhosting.ogdams.ng')
            .post('/api/v1/vend/airtime')
            .reply(200, response);

        const data = {
            networkId: 1,
            amount: 100,
            phoneNumber: '08012345678',
            type: 'VTU',
            reference: 'test-ref'
        };

        const result = await OgdamsService.purchaseAirtime(data);
        expect(result).toEqual(response);
    });

    it('should throw an error when the API call fails', async () => {
        nock('https://simhosting.ogdams.ng')
            .post('/api/v1/vend/airtime')
            .reply(500, { message: 'Internal Server Error' });

        const data = {
            networkId: 1,
            amount: 100,
            phoneNumber: '08012345678',
            type: 'VTU',
            reference: 'test-ref'
        };

        await expect(OgdamsService.purchaseAirtime(data)).rejects.toThrow('Internal Server Error');
    });

    it('should throw an error when the payload is invalid', async () => {
        const data = {
            networkId: 1,
            amount: 100,
            phoneNumber: 'invalid-phone-number',
            type: 'VTU',
            reference: 'test-ref'
        };

        await expect(OgdamsService.purchaseAirtime(data)).rejects.toThrow('Invalid payload: "phoneNumber" with value "invalid-phone-number" fails to match the required pattern: /^[0-9]{11}$/');
    });
});
