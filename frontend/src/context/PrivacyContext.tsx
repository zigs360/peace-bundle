import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface PrivacyContextType {
  isAmountHidden: boolean;
  toggleAmountHidden: () => void;
  formatAmount: (amount: number | string | null | undefined, prefix?: string) => string;
}

const PrivacyContext = createContext<PrivacyContextType>({
  isAmountHidden: false,
  toggleAmountHidden: () => {},
  formatAmount: () => '₦0.00',
});

const STORAGE_KEY = 'pb_privacy_hide_amounts';

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAmountHidden, setIsAmountHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isAmountHidden));
    } catch (e) {
      console.warn('Failed to persist privacy preference', e);
    }
  }, [isAmountHidden]);

  const toggleAmountHidden = useCallback(() => {
    setIsAmountHidden(prev => !prev);
  }, []);

  const formatAmount = useCallback((amount: number | string | null | undefined, prefix: string = '₦'): string => {
    if (isAmountHidden) {
      return `${prefix}******`;
    }

    if (amount === null || amount === undefined || amount === '') {
      return `${prefix}0.00`;
    }

    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(num)) {
      return `${prefix}0.00`;
    }

    return `${prefix}${num.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [isAmountHidden]);

  return (
    <PrivacyContext.Provider value={{ isAmountHidden, toggleAmountHidden, formatAmount }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => useContext(PrivacyContext);
