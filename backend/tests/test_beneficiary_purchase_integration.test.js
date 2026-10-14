const { saveBeneficiaryForUser } = require('../controllers/beneficiaryController');
const Beneficiary = require('../models/Beneficiary');

describe('Beneficiary Purchase Integration & Upsert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveBeneficiaryForUser', () => {
    it('returns null if userId or phone is missing', async () => {
      const res1 = await saveBeneficiaryForUser({ phone: '08031234567' });
      expect(res1).toBeNull();

      const res2 = await saveBeneficiaryForUser({ userId: 'user-123', phone: '' });
      expect(res2).toBeNull();
    });

    it('creates a new beneficiary when none exists for the user and phone', async () => {
      const mockFindOne = jest.spyOn(Beneficiary, 'findOne').mockResolvedValue(null);
      const mockCreate = jest.spyOn(Beneficiary, 'create').mockResolvedValue({
        id: 'ben-1',
        userId: 'user-123',
        phoneNumber: '08031234567',
        network: 'mtn',
        name: 'Mum',
      });

      const result = await saveBeneficiaryForUser({
        userId: 'user-123',
        phone: '08031234567',
        network: 'mtn',
        name: 'Mum',
      });

      expect(mockFindOne).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          phoneNumber: '08031234567',
          network: 'mtn',
          name: 'Mum',
        })
      );
      expect(result).toBeDefined();
      expect(result.name).toBe('Mum');

      mockFindOne.mockRestore();
      mockCreate.mockRestore();
    });

    it('normalizes phone number before searching and creating', async () => {
      const mockFindOne = jest.spyOn(Beneficiary, 'findOne').mockResolvedValue(null);
      const mockCreate = jest.spyOn(Beneficiary, 'create').mockResolvedValue({
        id: 'ben-2',
        userId: 'user-123',
        phoneNumber: '08031234567',
        network: 'airtel',
        name: 'AIRTEL - 08031234567',
      });

      await saveBeneficiaryForUser({
        userId: 'user-123',
        phone: '+234 803 123 4567',
        network: 'airtel',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumber: '08031234567',
          network: 'airtel',
          name: 'AIRTEL - 08031234567',
        })
      );

      mockFindOne.mockRestore();
      mockCreate.mockRestore();
    });

    it('updates existing beneficiary instead of creating duplicate', async () => {
      const existing = {
        id: 'ben-existing',
        userId: 'user-123',
        phoneNumber: '08031234567',
        network: 'glo',
        name: 'Old Name',
        update: jest.fn().mockImplementation((updates) => {
          Object.assign(existing, updates);
          return Promise.resolve(existing);
        }),
      };

      const mockFindOne = jest.spyOn(Beneficiary, 'findOne').mockResolvedValue(existing);
      const mockCreate = jest.spyOn(Beneficiary, 'create');

      const result = await saveBeneficiaryForUser({
        userId: 'user-123',
        phone: '08031234567',
        network: 'mtn',
        name: 'New Custom Name',
      });

      expect(mockFindOne).toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
      expect(existing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Custom Name',
          network: 'mtn',
        })
      );
      expect(result.name).toBe('New Custom Name');
      expect(result.network).toBe('mtn');

      mockFindOne.mockRestore();
      mockCreate.mockRestore();
    });
  });
});
