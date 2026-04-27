import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Lock, User, Mail, Phone, Hash, Loader2, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthShell from '../components/ui/AuthShell';

export default function Register() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    referralCode: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/register', formData);
      const data = res.data as { token: string; user: any };
      localStorage.setItem('token', data.token);
      const userForStorage = { ...data.user };
      delete userForStorage.virtual_account_number;
      delete userForStorage.virtual_account_bank;
      delete userForStorage.virtual_account_name;
      localStorage.setItem('user', JSON.stringify(userForStorage));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.createAccount')}
      subtitle={t('auth.registerSubtitle')}
      backLabel={t('auth.backHome')}
    >
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('auth.fullName')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="w-5 h-5 text-slate-400" />
              </div>
              <input
                name="fullName"
                type="text"
                required
                className="enterprise-input pl-10"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Al-Amin Aminu"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('auth.email')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="w-5 h-5 text-slate-400" />
              </div>
              <input
                name="email"
                type="email"
                required
                className="enterprise-input pl-10"
                value={formData.email}
                onChange={handleChange}
                placeholder="al-amin@example.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('auth.phone')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="w-5 h-5 text-slate-400" />
              </div>
              <input
                name="phone"
                type="tel"
                required
                className="enterprise-input pl-10"
                value={formData.phone}
                onChange={handleChange}
                placeholder="08012345678"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('auth.password')}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-slate-400" />
              </div>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                className="enterprise-input pl-10 pr-10"
                value={formData.password}
                onChange={handleChange}
                placeholder="Min 8 characters"
              />
               <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.referralCode')} <span className="font-normal text-slate-400">({t('auth.optional')})</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Hash className="w-5 h-5 text-slate-400" />
              </div>
              <input
                name="referralCode"
                type="text"
                className="enterprise-input pl-10"
                value={formData.referralCode}
                onChange={handleChange}
                placeholder="Referral Code"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="enterprise-button-primary mt-4 w-full"
          >
             {loading ? (
              <span className="flex items-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('auth.creatingAccount')}
              </span>
            ) : t('auth.createAccount')}
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-600">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-800">
              {t('auth.signInHere')}
            </Link>
          </p>
        </div>
    </AuthShell>
  );
}
