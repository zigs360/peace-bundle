import SeoHead from '../components/seo/SeoHead';
import { FadeIn } from '../components/animations/MotionComponents';
import { useTranslation } from 'react-i18next';

export default function Privacy() {
  const { t, i18n } = useTranslation();
  const lastUpdated = new Date().toLocaleDateString(i18n.language);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <SeoHead 
        title={t('privacy.seoTitle')}
        description={t('privacy.seoDescription')}
      />
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 md:p-12">
        <FadeIn>
          <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('privacy.title')}</h1>
          
          <div className="prose prose-blue max-w-none text-gray-600 space-y-6">
            <p className="text-sm text-gray-500">{t('privacy.lastUpdated', { date: lastUpdated })}</p>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('privacy.introductionTitle')}</h2>
              <p>{t('privacy.introductionBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('privacy.infoCollectTitle')}</h2>
              <p>{t('privacy.infoCollectIntro')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>{t('privacy.identityData')}</li>
                <li>{t('privacy.contactData')}</li>
                <li>{t('privacy.financialData')}</li>
                <li>{t('privacy.technicalData')}</li>
                <li>{t('privacy.usageData')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('privacy.howWeUseTitle')}</h2>
              <p>{t('privacy.howWeUseIntro')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>{t('privacy.useContract')}</li>
                <li>{t('privacy.useLegitimate')}</li>
                <li>{t('privacy.useLegal')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('privacy.securityTitle')}</h2>
              <p>{t('privacy.securityBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('privacy.retentionTitle')}</h2>
              <p>{t('privacy.retentionBody')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('privacy.rightsTitle')}</h2>
              <p>{t('privacy.rightsIntro')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>{t('privacy.rightAccess')}</li>
                <li>{t('privacy.rightCorrection')}</li>
                <li>{t('privacy.rightErasure')}</li>
                <li>{t('privacy.rightObject')}</li>
                <li>{t('privacy.rightRestriction')}</li>
                <li>{t('privacy.rightTransfer')}</li>
                <li>{t('privacy.rightWithdraw')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{t('privacy.contactTitle')}</h2>
              <p>
                {t('privacy.contactBody')}
                <br />
                <strong>Email:</strong> support@peacebundlle.com
              </p>
            </section>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
