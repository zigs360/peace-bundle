import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthShell from '../components/ui/AuthShell';
import api from '../services/api';
import { getPasswordRuleChecks, isPasswordStrong } from '../utils/passwordStrength';

function isSecureContextAllowed() {
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return protocol === 'https:';
}

function enforceHttpsIfNeeded() {
  if (import.meta.env.PROD && !isSecureContextAllowed()) {
    window.location.href = window.location.href.replace(/^http:/i, 'https:');
  }
}

type Step = 'email' | 'code' | 'password' | 'done';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    enforceHttpsIfNeeded();
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const emailLooksValid = useMemo(() => /\\S+@\\S+\\.\\S+/.test(email.trim()), [email]);
  const checks = useMemo(() => getPasswordRuleChecks(password), [password]);
  const passwordStrong = useMemo(() => isPasswordStrong(password), [password]);

  // Step 1: Send 4-digit code to email
  const handleRequestCode = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    if (!emailLooksValid) {
      setError(t('auth.reset.invalidEmail', 'Please enter a valid email address.'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/password-reset/request', { email: email.trim() });
      setSuccess(res.data?.message || 'A 4-digit verification code has been sent to your email.');
      setStep('code');
      setCooldown(60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to request reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify 4-digit code
  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const cleanCode = code.trim().replace(/\\D/g, '');
    if (cleanCode.length !== 4) {
      setError('Please enter the full 4-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/password-reset/verify', {
        email: email.trim(),
        code: cleanCode,
      });
      setSuccess(res.data?.message || 'Code verified successfully! Choose your new password.');
      setStep('password');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Complete Password Reset
  const handleCompleteReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!passwordStrong) {
      setError(t('auth.reset.weakPassword', 'Password does not meet strength requirements.'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.reset.passwordMismatch', 'Passwords do not match.'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/password-reset/complete', {
        token: code.trim().replace(/\\D/g, ''),
        email: email.trim(),
        newPassword: password,
        confirmPassword,
      });
      setSuccess(res.data?.message || 'Password reset successfully!');
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'email':
        return t('auth.reset.requestTitle', 'Forgot Password');
      case 'code':
        return 'Verify 4-Digit Code';
      case 'password':
        return t('auth.reset.completeTitle', 'Reset Password');
      case 'done':
        return 'Password Changed!';
    }
  };

  const getStepSubtitle = () => {
    switch (step) {
      case 'email':
        return t('auth.reset.requestSubtitle', 'Enter your registered email to receive a 4-digit recovery code.');
      case 'code':
        return `We sent a 4-digit code to ${email}. Enter it below:`;
      case 'password':
        return 'Create a secure new password for your account.';
      case 'done':
        return 'Your password has been successfully updated.';
    }
  };

  const rules = [
    { key: 'minLength', label: t('auth.reset.ruleMinLength', 'At least 8 characters'), valid: checks.minLength },
    { key: 'uppercase', label: t('auth.reset.ruleUppercase', 'At least 1 uppercase letter'), valid: checks.uppercase },
    { key: 'lowercase', label: t('auth.reset.ruleLowercase', 'At least 1 lowercase letter'), valid: checks.lowercase },
    { key: 'number', label: t('auth.reset.ruleNumber', 'At least 1 number'), valid: checks.number },
    { key: 'special', label: t('auth.reset.ruleSpecial', 'At least 1 special character'), valid: checks.special },
  ];

  return (
    <AuthShell
      title={getStepTitle()}
      subtitle={getStepSubtitle()}
      backLabel={t('auth.backHome', 'Back to Home')}
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && step !== 'done' && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Step Indicator */}
      {step !== 'done' && (
        <div className="mb-8 flex items-center justify-center space-x-2">
          <div className={`h-2 rounded-full transition-all ${step === 'email' ? 'w-8 bg-primary-600' : 'w-2 bg-slate-300'}`} />
          <div className={`h-2 rounded-full transition-all ${step === 'code' ? 'w-8 bg-primary-600' : 'w-2 bg-slate-300'}`} />
          <div className={`h-2 rounded-full transition-all ${step === 'password' ? 'w-8 bg-primary-600' : 'w-2 bg-slate-300'}`} />
        </div>
      )}

      {/* STEP 1: Enter Email */}
      {step === 'email' && (
        <form className="space-y-6" onSubmit={handleRequestCode}>
          <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-slate-700">
              {t('auth.email', 'Email Address')}
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-5 w-5 text-slate-400" />
              </div>
              <input
                id="reset-email"
                type="email"
                required
                className="enterprise-input pl-10"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {!emailLooksValid && email.length > 0 && (
              <p className="mt-2 text-sm text-amber-700">{t('auth.reset.invalidEmail', 'Please enter a valid email')}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="enterprise-button-primary w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sending 4-Digit Code...
              </span>
            ) : (
              'Send 4-Digit Code'
            )}
          </button>
        </form>
      )}

      {/* STEP 2: Enter 4-Digit Code */}
      {step === 'code' && (
        <form className="space-y-6" onSubmit={handleVerifyCode}>
          <div>
            <label htmlFor="reset-code" className="mb-2 block text-sm font-medium text-slate-700">
              4-Digit Verification Code
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <KeyRound className="h-5 w-5 text-slate-400" />
              </div>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                required
                autoFocus
                className="enterprise-input pl-10 text-center font-mono text-2xl font-bold tracking-[0.5em]"
                placeholder="••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\\D/g, '').slice(0, 4))}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 text-center">
              Check your inbox (and spam folder) for the 4-digit code.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || code.trim().length !== 4}
            className="enterprise-button-primary w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying Code...
              </span>
            ) : (
              'Verify Code'
            )}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError('');
              }}
              className="text-slate-500 hover:text-slate-700"
            >
              Change Email
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={() => handleRequestCode()}
              className="font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: Set New Password */}
      {step === 'password' && (
        <form className="space-y-6" onSubmit={handleCompleteReset}>
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-700">
              New Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                id="new-password"
                type="password"
                required
                className="enterprise-input pl-10"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-700">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                id="confirm-password"
                type="password"
                required
                className="enterprise-input pl-10"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Password Requirements
            </p>
            <ul className="space-y-1.5 text-xs">
              {rules.map((rule) => (
                <li key={rule.key} className={`flex items-center ${rule.valid ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  <span className={`mr-2 h-1.5 w-1.5 rounded-full ${rule.valid ? 'bg-emerald-600' : 'bg-slate-300'}`} />
                  {rule.label}
                </li>
              ))}
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading || !passwordStrong || password !== confirmPassword}
            className="enterprise-button-primary w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Saving Password...
              </span>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      )}

      {/* STEP 4: Success / Done */}
      {step === 'done' && (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Password Reset Successful!</h3>
            <p className="mt-2 text-sm text-slate-600">
              Your password has been changed successfully. You can now log into your account with your new password.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="enterprise-button-primary w-full"
          >
            Go to Login
          </button>
        </div>
      )}

      {step !== 'done' && (
        <div className="mt-8 text-center text-sm text-slate-600">
          <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-800">
            {t('auth.reset.backToLogin', 'Back to Sign In')}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}