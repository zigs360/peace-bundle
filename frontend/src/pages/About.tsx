import { ShieldCheck, Zap, Globe, Award, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SeoHead from '../components/seo/SeoHead';
import { FadeIn, SlideUp, StaggerContainer, StaggerItem } from '../components/animations/MotionComponents';

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <SeoHead
        title={t('aboutPage.seoTitle')}
        description={t('aboutPage.seoDescription')}
      />

      {/* Hero Section */}
      <section className="relative bg-primary-900 text-white py-24 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
            <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <SlideUp>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
              {t('aboutPage.heroTitle')}
            </h1>
            <p className="text-xl md:text-2xl text-primary-100 max-w-3xl mx-auto font-light leading-relaxed">
              {t('aboutPage.heroSubtitle')}
            </p>
          </SlideUp>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <FadeIn>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-video bg-gray-200">
                {/* Placeholder for an office image or team image */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-secondary-600 flex items-center justify-center">
                  <Globe className="w-24 h-24 text-white opacity-20" />
                </div>
              </div>
            </FadeIn>
            
            <SlideUp delay={0.2}>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('aboutPage.storyTitle')}</h2>
              <div className="space-y-4 text-gray-600 text-lg leading-relaxed">
                <p>{t('aboutPage.storyParagraph1')}</p>
                <p>{t('aboutPage.storyParagraph2')}</p>
                <p>{t('aboutPage.storyParagraph3')}</p>
              </div>
            </SlideUp>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <FadeIn>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{t('aboutPage.valuesTitle')}</h2>
              <p className="text-xl text-gray-500 max-w-2xl mx-auto">{t('aboutPage.valuesSubtitle')}</p>
            </FadeIn>
          </div>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StaggerItem className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-6 text-blue-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{t('aboutPage.integrityTitle')}</h3>
              <p className="text-gray-600">{t('aboutPage.integrityBody')}</p>
            </StaggerItem>

            <StaggerItem className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center mb-6 text-yellow-600">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{t('aboutPage.speedTitle')}</h3>
              <p className="text-gray-600">{t('aboutPage.speedBody')}</p>
            </StaggerItem>

            <StaggerItem className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-6 text-green-600">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{t('aboutPage.customerFirstTitle')}</h3>
              <p className="text-gray-600">{t('aboutPage.customerFirstBody')}</p>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-primary-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <StaggerItem>
              <div className="text-4xl md:text-5xl font-bold mb-2 text-secondary-400">50k+</div>
              <div className="text-primary-200 font-medium">{t('aboutPage.happyUsers')}</div>
            </StaggerItem>
            <StaggerItem>
              <div className="text-4xl md:text-5xl font-bold mb-2 text-secondary-400">1M+</div>
              <div className="text-primary-200 font-medium">{t('aboutPage.successfulTransactions')}</div>
            </StaggerItem>
            <StaggerItem>
              <div className="text-4xl md:text-5xl font-bold mb-2 text-secondary-400">4.8</div>
              <div className="text-primary-200 font-medium">{t('aboutPage.userRating')}</div>
            </StaggerItem>
            <StaggerItem>
              <div className="text-4xl md:text-5xl font-bold mb-2 text-secondary-400">24/7</div>
              <div className="text-primary-200 font-medium">Support</div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-white text-center">
        <div className="max-w-4xl mx-auto px-4">
          <SlideUp>
            <Award className="w-16 h-16 text-primary-600 mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">{t('aboutPage.joinTitle')}</h2>
            <p className="text-xl text-gray-500 mb-10">{t('aboutPage.joinSubtitle')}</p>
            <a href="/register" className="inline-flex items-center justify-center px-8 py-4 bg-primary-600 text-white rounded-xl font-bold text-lg hover:bg-primary-700 transition shadow-lg hover:shadow-primary-500/30">
              {t('aboutPage.getStarted')}
            </a>
          </SlideUp>
        </div>
      </section>
    </div>
  );
}
