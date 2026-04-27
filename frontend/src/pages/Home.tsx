import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Globe2, GraduationCap, ShieldCheck, Smartphone, Wifi, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FadeIn, HoverCard, ScaleIn, SlideUp, StaggerContainer, StaggerItem } from '../components/animations/MotionComponents';
import SeoHead from '../components/seo/SeoHead';
import ReviewSection from '../components/ReviewSection';
import BrandMark from '../components/ui/BrandMark';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import ShellFrame from '../components/ui/ShellFrame';
import SurfaceCard from '../components/ui/SurfaceCard';

const services = [
  {
    icon: Wifi,
    titleKey: 'home.serviceDataTitle',
    descriptionKey: 'home.serviceDataDescription',
    tint: 'bg-sky-100 text-sky-700',
  },
  {
    icon: Smartphone,
    titleKey: 'home.serviceAirtimeTitle',
    descriptionKey: 'home.serviceAirtimeDescription',
    tint: 'bg-emerald-100 text-emerald-700',
  },
  {
    icon: Zap,
    titleKey: 'home.serviceBillsTitle',
    descriptionKey: 'home.serviceBillsDescription',
    tint: 'bg-amber-100 text-amber-700',
  },
  {
    icon: GraduationCap,
    titleKey: 'home.serviceEducationTitle',
    descriptionKey: 'home.serviceEducationDescription',
    tint: 'bg-violet-100 text-violet-700',
  },
];

const trustStats = [
  { value: '500+', labelKey: 'home.statsUsers' },
  { value: '99.9%', labelKey: 'home.statsUptime' },
  { value: '<3s', labelKey: 'home.statsDelivery' },
  { value: '24/7', labelKey: 'home.statsSupport' },
];

const featureList = [
  {
    icon: ShieldCheck,
    titleKey: 'home.featureTrustTitle',
    descriptionKey: 'home.featureTrustDescription',
    tint: 'bg-primary-100 text-primary-700',
  },
  {
    icon: Clock3,
    titleKey: 'home.featureSpeedTitle',
    descriptionKey: 'home.featureSpeedDescription',
    tint: 'bg-accent-100 text-accent-700',
  },
  {
    icon: Globe2,
    titleKey: 'home.featureLocalizationTitle',
    descriptionKey: 'home.featureLocalizationDescription',
    tint: 'bg-sky-100 text-sky-700',
  },
];

export default function Home() {
  const { t } = useTranslation();

  return (
    <ShellFrame>
      <SeoHead 
        title="Enterprise Airtime, Data & Utility Payments" 
        description="A premium digital payments experience for Nigeria with trusted fulfilment, accessible workflows, and multilingual support."
      />

      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-white focus:px-4 focus:py-3">
        {t('common.skipToContent')}
      </a>

      <div className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="container flex min-h-20 items-center justify-between gap-4 py-4">
          <BrandMark />
          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <LanguageSwitcher />
            </div>
            <Link to="/login" className="enterprise-button-secondary">
              {t('nav.login')}
            </Link>
            <Link to="/register" className="enterprise-button-primary">
              {t('nav.register')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <section className="container py-16 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-3xl">
            <SlideUp>
              <div className="mb-5 inline-flex rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-700">
                {t('home.eyebrow')}
              </div>
            </SlideUp>
            <SlideUp delay={0.1}>
              <h1 className="text-balance text-5xl font-semibold tracking-tight text-slate-950 md:text-7xl">
                {t('home.title')}
              </h1>
            </SlideUp>
            <SlideUp delay={0.2}>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">{t('home.subtitle')}</p>
            </SlideUp>
            <SlideUp delay={0.3} className="mt-8 flex flex-col gap-4 sm:flex-row">
              <HoverCard>
                <Link to="/register" className="enterprise-button-primary min-w-52">
                  {t('home.primaryCta')} <ArrowRight className="h-4 w-4" />
                </Link>
              </HoverCard>
              <HoverCard>
                <a href="#services" className="enterprise-button-secondary min-w-52">
                  {t('home.secondaryCta')}
                </a>
              </HoverCard>
            </SlideUp>
            <FadeIn delay={0.4} className="mt-10 flex items-center gap-3 text-sm font-medium text-slate-500">
              <CheckCircle2 className="h-5 w-5 text-primary-600" />
              <span>{t('common.trustedBy')}</span>
            </FadeIn>
            <FadeIn delay={0.5} className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
              {trustStats.map((stat) => (
                <SurfaceCard key={stat.labelKey} className="p-5">
                  <div className="text-3xl font-semibold tracking-tight text-slate-950">{stat.value}</div>
                  <div className="mt-2 text-sm text-slate-500">{t(stat.labelKey)}</div>
                </SurfaceCard>
              ))}
            </FadeIn>
          </div>

          <ScaleIn>
            <SurfaceCard elevated className="relative overflow-hidden p-8 md:p-10">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary-100 blur-3xl" />
              <div className="absolute -bottom-20 left-0 h-52 w-52 rounded-full bg-accent-100 blur-3xl" />
              <div className="relative space-y-5">
                <div className="rounded-3xl border border-white/60 bg-slate-950 p-6 text-white shadow-soft-lg">
                  <div className="mb-5 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-300">{t('home.serviceFulfilment')}</p>
                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                      {t('home.live')}
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                      <span className="text-sm text-slate-300">{t('home.corporateMtnData')}</span>
                      <span className="text-sm font-semibold">{t('home.completed')}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                      <span className="text-sm text-slate-300">{t('home.treasuryStatus')}</span>
                      <span className="text-sm font-semibold">{t('home.balanced')}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                      <span className="text-sm text-slate-300">{t('home.supportQueue')}</span>
                      <span className="text-sm font-semibold">{t('home.openCount', { count: 2 })}</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="enterprise-panel p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{t('home.accessibilityTitle')}</div>
                    <div className="mt-3 text-2xl font-semibold text-slate-950">{t('home.accessibilityValue')}</div>
                    <p className="mt-2 text-sm text-slate-600">{t('home.accessibilityDescription')}</p>
                  </div>
                  <div className="enterprise-panel p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{t('home.localisationTitle')}</div>
                    <div className="mt-3 text-2xl font-semibold text-slate-950">{t('home.localisationValue')}</div>
                    <p className="mt-2 text-sm text-slate-600">{t('home.localisationDescription')}</p>
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </ScaleIn>
        </div>
      </section>

      <section id="services" className="container py-20">
        <FadeIn className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            {t('home.servicesTitle')}
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">{t('home.servicesSubtitle')}</p>
        </FadeIn>

        <StaggerContainer className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <StaggerItem key={service.titleKey}>
                <SurfaceCard className="group h-full p-7 transition-transform duration-200 hover:-translate-y-1">
                  <div className={`mb-6 inline-flex rounded-2xl p-3 ${service.tint}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950">{t(service.titleKey)}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{t(service.descriptionKey)}</p>
                </SurfaceCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </section>

      <section className="container py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.95fr]">
          <div>
            <SlideUp>
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                {t('home.featureTitle')}
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{t('home.featureSubtitle')}</p>
            </SlideUp>
            <div className="mt-10 space-y-5">
              {featureList.map((item) => {
                const Icon = item.icon;
                return (
                  <SurfaceCard key={item.titleKey} className="flex gap-4 p-5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.tint}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">{t(item.titleKey)}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{t(item.descriptionKey)}</p>
                    </div>
                  </SurfaceCard>
                );
              })}
            </div>
          </div>
          <ScaleIn>
            <div className="rounded-[2rem] border border-white/60 bg-slate-950 p-8 text-white shadow-soft-lg">
              <div className="grid gap-4">
                <div className="rounded-3xl bg-white/5 p-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t('home.navigationTitle')}</div>
                  <div className="text-lg font-semibold">{t('home.navigationDescription')}</div>
                </div>
                <div className="rounded-3xl bg-white/5 p-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t('home.performanceTitle')}</div>
                  <div className="text-lg font-semibold">{t('home.performanceDescription')}</div>
                </div>
                <div className="rounded-3xl bg-white/5 p-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t('home.motionTitle')}</div>
                  <div className="text-lg font-semibold">{t('home.motionDescription')}</div>
                </div>
              </div>
            </div>
          </ScaleIn>
        </div>
      </section>

      <ReviewSection />

      <section className="container py-20">
        <SurfaceCard elevated className="overflow-hidden bg-slate-950 p-10 text-center text-white md:p-14">
          <SlideUp>
            <h2 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {t('home.ctaTitle')}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">{t('home.ctaSubtitle')}</p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Link to="/register" className="enterprise-button bg-primary-600 text-white hover:bg-primary-500">
                {t('home.primaryCta')}
              </Link>
              <Link to="/contact" className="enterprise-button border border-white/15 bg-white/5 text-white hover:bg-white/10">
                {t('home.contactSales')}
              </Link>
            </div>
          </SlideUp>
        </SurfaceCard>
      </section>

      <footer className="border-t border-white/60 bg-white/70 py-10 backdrop-blur-xl">
        <div className="container flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <BrandMark subtitle={t('home.footerSubtitle')} />
          </div>
          <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-500">
            <Link to="/about">{t('nav.about')}</Link>
            <Link to="/contact">{t('nav.contact')}</Link>
            <Link to="/privacy">{t('nav.privacy')}</Link>
            <Link to="/terms">{t('nav.terms')}</Link>
          </div>
          <div className="text-sm text-slate-400">© {new Date().getFullYear()} {t('common.brand')}</div>
        </div>
      </footer>
    </ShellFrame>
  );
}
