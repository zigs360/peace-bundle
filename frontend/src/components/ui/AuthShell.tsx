import type { ReactNode } from 'react';
import { ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import BrandMark from './BrandMark';
import LanguageSwitcher from './LanguageSwitcher';
import ShellFrame from './ShellFrame';
import SurfaceCard from './SurfaceCard';

interface AuthShellProps {
  title: string;
  subtitle: string;
  backLabel: string;
  children: ReactNode;
}

export default function AuthShell({ title, subtitle, backLabel, children }: AuthShellProps) {
  const { t } = useTranslation();

  const trustItems = [
    { icon: ShieldCheck, text: t('auth.trustedOne') },
    { icon: Workflow, text: t('auth.trustedTwo') },
    { icon: Sparkles, text: t('auth.trustedThree') },
  ];

  return (
    <ShellFrame>
      <div className="container flex min-h-screen flex-col py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <BrandMark />
          <LanguageSwitcher />
        </div>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <SurfaceCard elevated className="hidden h-full overflow-hidden bg-slate-950 p-10 text-white lg:block">
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
                  {t('auth.trustedTitle')}
                </div>
                <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-4 max-w-lg text-lg leading-8 text-slate-300">{subtitle}</p>
              </div>

              <div className="space-y-4">
                {trustItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.text} className="flex items-start gap-4 rounded-3xl bg-white/5 p-5">
                      <div className="rounded-2xl bg-white/10 p-3">
                        <Icon className="h-5 w-5 text-accent-300" />
                      </div>
                      <p className="text-sm leading-7 text-slate-200">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard elevated className="mx-auto w-full max-w-xl p-8 md:p-10">
            <Link to="/" className="mb-8 inline-flex items-center text-sm font-semibold text-slate-500 hover:text-primary-700">
              {backLabel}
            </Link>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </SurfaceCard>
        </div>
      </div>
    </ShellFrame>
  );
}
