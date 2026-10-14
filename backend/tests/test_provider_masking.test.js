const {
  sanitizeUserFacingErrorMessage,
  sanitizeTransactionForClient,
  KNOWN_UPSTREAM_PROVIDERS_REGEX,
} = require('../utils/clientPayloadSanitizers');

describe('Provider Masking & Peace Bundle Failure Branding', () => {
  describe('sanitizeUserFacingErrorMessage', () => {
    it('brands QuicklySIM data purchase failure as Peace Bundle', () => {
      const input = 'QuicklySIM data purchase failed';
      const output = sanitizeUserFacingErrorMessage(input);
      expect(output).toBe('Data purchase failed on Peace Bundle and was automatically reversed');
      expect(output).not.toMatch(/quicklysim/i);
    });

    it('brands QuicklySIM airtime purchase failure as Peace Bundle', () => {
      const input = 'QuicklySIM airtime purchase failed';
      const output = sanitizeUserFacingErrorMessage(input);
      expect(output).toBe('Airtime purchase failed on Peace Bundle and was automatically reversed');
      expect(output).not.toMatch(/quicklysim/i);
    });

    it('brands Ogdams data failure as Peace Bundle', () => {
      const input = 'Ogdams data purchase failed';
      const output = sanitizeUserFacingErrorMessage(input);
      expect(output).toBe('Data purchase failed on Peace Bundle and was automatically reversed');
      expect(output).not.toMatch(/ogdams/i);
    });

    it('brands SMEPlug data failure as Peace Bundle', () => {
      const input = 'SMEPlug error: insufficient api balance';
      const output = sanitizeUserFacingErrorMessage(input, 'Transaction failed on Peace Bundle. Please try again or contact support.');
      expect(output).toBe('Transaction failed on Peace Bundle. Please try again or contact support.');
      expect(output).not.toMatch(/smeplug/i);
    });

    it('brands SIM pool route error as Peace Bundle', () => {
      const input = 'SIM pool route selected but SIM pool is disabled';
      const output = sanitizeUserFacingErrorMessage(input, 'Transaction failed on Peace Bundle. Please try again or contact support.');
      expect(output).toBe('Transaction failed on Peace Bundle. Please try again or contact support.');
      expect(output).not.toMatch(/sim pool/i);
    });

    it('brands provider did not confirm success message as Peace Bundle', () => {
      const input = 'Airtime provider did not confirm success. Transaction was automatically reversed';
      const output = sanitizeUserFacingErrorMessage(input);
      expect(output).toBe('Airtime purchase failed on Peace Bundle and was automatically reversed');
      expect(output).not.toMatch(/provider/i);
    });

    it('replaces provider names in generic messages with Peace Bundle', () => {
      const input = 'Transaction routed through Topupmate was canceled';
      const output = sanitizeUserFacingErrorMessage(input);
      expect(output).toContain('Peace Bundle');
      expect(output).not.toMatch(/topupmate/i);
    });

    it('preserves clean user validation messages', () => {
      const input = 'Invalid phone number format';
      const output = sanitizeUserFacingErrorMessage(input);
      expect(output).toBe('Invalid phone number format');
    });
  });

  describe('sanitizeTransactionForClient', () => {
    it('completely strips provider metadata and masks failure_reason for regular users', () => {
      const mockTx = {
        id: 'tx-123',
        amount: 500,
        provider: 'quicklysim',
        status: 'refunded',
        failure_reason: 'QuicklySIM data purchase failed',
        description: 'MTN 1GB Data Purchase via QuicklySIM',
        metadata: {
          network: 'mtn',
          service_provider: 'quicklysim',
          provider_plan_id: '99',
          provider_attempts: [{ provider: 'quicklysim', status: 'failed' }],
          locked_route: { fulfillmentRoute: 'quicklysim' },
          vend_amount: 500,
        },
      };

      const sanitized = sanitizeTransactionForClient(mockTx, { isAdmin: false });

      // Provider slug masked
      expect(sanitized.provider).toBe('mtn');

      // Failure reason branded as Peace Bundle
      expect(sanitized.failure_reason).toBe('Data purchase failed on Peace Bundle and was automatically reversed');
      expect(sanitized.failure_reason).not.toMatch(/quicklysim/i);

      // Description branded as Peace Bundle
      expect(sanitized.description).toBe('MTN 1GB Data Purchase via Peace Bundle');
      expect(sanitized.description).not.toMatch(/quicklysim/i);

      // Sensitive metadata keys deleted
      expect(sanitized.metadata.service_provider).toBeUndefined();
      expect(sanitized.metadata.provider_plan_id).toBeUndefined();
      expect(sanitized.metadata.provider_attempts).toBeUndefined();
      expect(sanitized.metadata.locked_route).toBeUndefined();
      expect(sanitized.metadata.vend_amount).toBe(500);
    });

    it('retains technical provider details for admin users', () => {
      const mockTx = {
        id: 'tx-admin-view',
        provider: 'quicklysim',
        failure_reason: 'QuicklySIM data purchase failed',
        metadata: {
          service_provider: 'quicklysim',
          provider_plan_id: '99',
        },
      };

      const adminTx = sanitizeTransactionForClient(mockTx, { isAdmin: true });
      expect(adminTx.provider).toBe('quicklysim');
      expect(adminTx.failure_reason).toBe('QuicklySIM data purchase failed');
      expect(adminTx.metadata.service_provider).toBe('quicklysim');
      expect(adminTx.metadata.provider_plan_id).toBe('99');
    });
  });
});
