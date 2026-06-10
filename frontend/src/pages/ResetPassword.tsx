import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Lock, XCircle } from 'lucide-react';
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

type ValidationState = 'loading' | 'valid' | 'invalid';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [validationState, setValidationState] = useState<ValidationState>('loading');
  const [validationMessage, setValidationMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const checks = useMemo(() => getPasswordRuleChecks(password), [password]);
  const passwordStrong = useMemo(() => isPasswordStrong(password), [password]);

  useEffect(() => {
    enforceHttpsIfNeeded();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        setValidationState('invalid');
        setValidationMessage(t('auth.reset.invalidToken'));
        return;
      }

      setValidationState('loading');
      try {
        const res = await api.get('/auth/password-reset/validate', { params: { token } });
        if (cancelled) return;
        setValidationState('valid');
        setValidationMessage(res.data?.message || t('auth.reset.validToken'));
      } catch (err: any) {
        if (cancelled) return;
        setValidationState('invalid');
        setValidationMessage(err.response?.data?.message || t('auth.reset.invalidToken'));
      }
    }

    void validateToken();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!passwordStrong) {
      setError(t('auth.reset.weakPassword'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.reset.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/password-reset/complete', {
        token,
        newPassword: password,
        confirmPassword,
      });
      setSuccess(res.data?.message || t('auth.reset.completed'));
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.reset.completeFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const rules = [
    { key: 'minLength', label: t('auth.reset.ruleMinLength'), valid: checks.minLength },
    { key: 'uppercase', label: t('auth.reset.ruleUppercase'), valid: checks.uppercase },
    { key: 'lowercase', label: t('auth.reset.ruleLowercase'), valid: checks.lowercase },
    { key: 'number', label: t('auth.reset.ruleNumber'), valid: checks.number },
    { key: 'special', label: t('auth.reset.ruleSpecial'), valid: checks.special },
  ];

  return (
    <AuthShell
      title={t('auth.reset.completeTitle')}
      subtitle={t('auth.reset.completeSubtitle')}
      backLabel={t('auth.backHome')}
    >
      {validationState === 'loading' && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {t('auth.reset.validating')}
        </div>
      )}
      {validationMessage && validationState !== 'loading' && (
        <div className={`mb-6 rounded-2xl px-4 py-3 text-sm ${
          validationState === 'valid'
            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border border-red-200 bg-red-50 text-red-700'
        }`}>
          {validationMessage}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {validationState === 'valid' && !success && (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="reset-new-password" className="mb-2 block text-sm font-medium text-slate-700">
              {t('auth.reset.newPassword')}
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                id="reset-new-password"
                type="password"
                required
                className="enterprise-input pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="reset-confirm-password" className="mb-2 block text-sm font-medium text-slate-700">
              {t('auth.reset.confirmPassword')}
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                id="reset-confirm-password"
                type="password"
                required
                className="enterprise-input pl-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">{t('auth.reset.passwordRules')}</p>
            <ul className="space-y-2 text-sm">
              {rules.map((rule) => (
                <li key={rule.key} className={`flex items-center gap-2 ${rule.valid ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {rule.valid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="enterprise-button-primary w-full"
          >
            {submitting ? (
              <span className="flex items-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('auth.reset.updating')}
              </span>
            ) : t('auth.reset.updatePassword')}
          </button>
        </form>
      )}

      <div className="mt-8 text-center text-sm text-slate-600">
        <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-800">
          {t('auth.reset.backToLogin')}
        </Link>
      </div>
    </AuthShell>
  );
}
