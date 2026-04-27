import SeoHead from '../components/seo/SeoHead';
import { FadeIn } from '../components/animations/MotionComponents';
import { useTranslation } from 'react-i18next';

export default function Terms() {
  const { t, i18n } = useTranslation();
  const lastUpdated = new Date().toLocaleDateString(i18n.language);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <SeoHead 
        title={t('terms.seoTitle')}
        description={t('terms.seoDescription')}
      />
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 md:p-12">
        <FadeIn>
          <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('terms.title')}</h1>
          
          <div className="prose prose-blue max-w-none text-gray-600 space-y-6">
            <p className="text-sm text-gray-500">{t('terms.lastUpdated', { date: lastUpdated })}</p>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.acceptanceTitle')}</h2>
              <p>{t('terms.acceptanceBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.serviceDescriptionTitle')}</h2>
              <p>{t('terms.serviceDescriptionBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.userAccountTitle')}</h2>
              <p>{t('terms.userAccountIntro')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>{t('terms.accountAccurateInfo')}</li>
                <li>{t('terms.accountMaintainInfo')}</li>
                <li>{t('terms.accountMaintainSecurity')}</li>
                <li>{t('terms.accountNotifyBreaches')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.paymentsTitle')}</h2>
              <p>{t('terms.paymentsBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.refundTitle')}</h2>
              <p>{t('terms.refundBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.prohibitedTitle')}</h2>
              <p>{t('terms.prohibitedIntro')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>{t('terms.prohibitedLaw')}</li>
                <li>{t('terms.prohibitedFraud')}</li>
                <li>{t('terms.prohibitedDisrupt')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.liabilityTitle')}</h2>
              <p>{t('terms.liabilityBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('terms.contactTitle')}</h2>
              <p>{t('terms.contactBody')}</p>
            </section>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
