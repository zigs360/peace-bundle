import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthShell from '../components/ui/AuthShell';
import api from '../services/api';

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

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devResetLink, setDevResetLink] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    enforceHttpsIfNeeded();
  }, []);

  const emailLooksValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setDevResetLink('');

    if (!emailLooksValid) {
      setError(t('auth.reset.invalidEmail'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/password-reset/request', { email: email.trim() });
      setSuccess(res.data?.message || t('auth.reset.requestSubmitted'));
      setDevResetLink(res.data?.devResetLink || '');
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.reset.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.reset.requestTitle')}
      subtitle={t('auth.reset.requestSubtitle')}
      backLabel={t('auth.backHome')}
    >
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
      {devResetLink && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Development reset link</p>
          <a href={devResetLink} className="break-all underline">
            {devResetLink}
          </a>
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-slate-700">
            {t('auth.email')}
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
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {!emailLooksValid && email.length > 0 && (
            <p className="mt-2 text-sm text-amber-700">{t('auth.reset.invalidEmail')}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="enterprise-button-primary w-full"
        >
          {loading ? (
            <span className="flex items-center">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('auth.reset.submitting')}
            </span>
          ) : t('auth.reset.sendLink')}
        </button>
      </form>

      <div className="mt-8 text-center text-sm text-slate-600">
        <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-800">
          {t('auth.reset.backToLogin')}
        </Link>
      </div>
    </AuthShell>
  );
}
