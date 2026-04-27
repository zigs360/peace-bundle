import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../../i18n/resources';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 shadow-soft backdrop-blur">
      <Languages className="h-4 w-4 text-primary-700" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        aria-label={t('common.language')}
        value={i18n.resolvedLanguage || 'en'}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="bg-transparent pr-5 text-sm font-medium text-slate-700 outline-none"
      >
        {supportedLanguages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
