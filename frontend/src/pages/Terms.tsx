import SeoHead from '../components/seo/SeoHead';
import { FadeIn } from '../components/animations/MotionComponents';

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <SeoHead 
        title="Terms of Service - Peace Bundlle" 
        description="Terms of Service for Peace Bundlle. Please read these terms carefully before using our services."
      />
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 md:p-12">
        <FadeIn>
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
          
          <div className="prose prose-blue max-w-none text-gray-600 space-y-6">
            <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing and using the Peace Bundlle website and services, you accept and agree to be bound by the terms and provision of this agreement. 
                In addition, when using these particular services, you shall be subject to any posted guidelines or rules applicable to such services. 
                Any participation in this service will constitute acceptance of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Service Description</h2>
              <p>
                Peace Bundlle provides users with access to purchase mobile data bundles, airtime, pay utility bills, and exam scratch cards (the "Services"). 
                We reserve the right to modify, suspend, or discontinue the Services at any time with or without notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. User Account</h2>
              <p>
                To access certain features of the Services, you may be required to register for an account. You agree to:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Provide accurate, current, and complete information during the registration process.</li>
                <li>Maintain and promptly update your account information.</li>
                <li>Maintain the security of your password and accept all risks of unauthorized access to your account.</li>
                <li>Notify us immediately if you discover or suspect any security breaches related to the Services.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Payments and Funding</h2>
              <p>
                All payments for services are made using the funds in your Peace Bundlle wallet. You can fund your wallet using the payment methods provided on the platform.
                We are not responsible for any fees charged by your bank or payment processor. All transactions are final and cannot be reversed once value has been given.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Refund Policy</h2>
              <p>
                We strive to provide a seamless experience. However, if a transaction fails and value is not delivered, a refund will be processed to your Peace Bundlle wallet automatically or upon complaint within 24 hours.
                Refunds are not provided for successful transactions where value has been delivered to the provided beneficiary number, even if the number was provided incorrectly by the user.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Prohibited Use</h2>
              <p>You agree not to use the Services to:</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Violate any local, state, national, or international law or regulation.</li>
                <li>Engage in any fraudulent activity or attempt to defraud Peace Bundlle or other users.</li>
                <li>Interfere with or disrupt the Services or servers or networks connected to the Services.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Limitation of Liability</h2>
              <p>
                In no event shall Peace Bundle, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, 
                including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Contact Information</h2>
              <p>
                Questions about the Terms of Service should be sent to us at support@peacebundle.com.
              </p>
            </section>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
