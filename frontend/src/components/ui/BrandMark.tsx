import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BrandMarkProps {
  compact?: boolean;
  subtitle?: string;
  href?: string;
}

export default function BrandMark({ compact = false, subtitle, href = '/' }: BrandMarkProps) {
  const { t } = useTranslation();

  return (
    <Link to={href} className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-xl">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-accent-500 shadow-soft ring-1 ring-white/60">
        <img src="/logo.png" alt={t('common.brand')} className="h-7 w-7 object-contain" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold tracking-tight text-slate-950">{t('common.brand')}</div>
          {subtitle ? <div className="truncate text-xs font-medium text-slate-500">{subtitle}</div> : null}
        </div>
      )}
    </Link>
  );
}
