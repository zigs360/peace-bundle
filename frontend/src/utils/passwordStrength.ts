export type PasswordRuleChecks = {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
};

export function getPasswordRuleChecks(password: string): PasswordRuleChecks {
  const value = String(password || '');
  return {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
}

export function isPasswordStrong(password: string): boolean {
  return Object.values(getPasswordRuleChecks(password)).every(Boolean);
}
