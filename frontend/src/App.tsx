import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Layout from './components/Layout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import Transactions from './pages/admin/AdminTransactionsPage';
import AdminPricing from './pages/admin/AdminPricing';
import PlansIndex from './pages/admin/Plans/Index';
import PriceHistory from './pages/admin/PriceHistory';
import CreatePlan from './pages/admin/Plans/Create';
import SimsIndex from './pages/admin/Sims/Index';
import CreateSim from './pages/admin/Sims/Create';
import BulkSMSIndex from './pages/admin/BulkSMS/Index';
import CreateBulkSMS from './pages/admin/BulkSMS/Create';
import Reports from './pages/admin/Reports';
import AdminSettings from './pages/admin/AdminSettings';
import AdminSupport from './pages/admin/Support';
import ReviewsIndex from './pages/admin/Reviews';
import SubscriptionsIndex from './pages/admin/Subscriptions/Index';
import CreateOrEditSubscriptionPlan from './pages/admin/Subscriptions/Create';
import KycIndex from './pages/admin/Kyc/Index';
import FundingReviews from './pages/admin/FundingReviews';
import Treasury from './pages/admin/Treasury';
import OgdamsDataPurchase from './pages/admin/OgdamsDataPurchase';
import WalletDeductions from './pages/admin/WalletDeductions';
import CallSubAdmin from './pages/admin/CallSub';
import UserLayout from './components/UserLayout';
import CookieConsent from './components/common/CookieConsent';
import UserDashboard from './pages/dashboard/UserDashboard';
import FundWallet from './pages/dashboard/FundWallet';
import BuyData from './pages/dashboard/BuyData';
import BuyAirtime from './pages/dashboard/BuyAirtime';
import CallSub from './pages/dashboard/CallSub';
import Transfer from './pages/dashboard/Transfer';
import PayBills from './pages/dashboard/PayBills';
import EducationPins from './pages/dashboard/EducationPins';
import BulkSMS from './pages/dashboard/BulkSMS';
import TransactionsPage from './pages/dashboard/TransactionsPage';
import Settings from './pages/dashboard/Settings';
import ApiKeys from './pages/dashboard/ApiKeys';
import Affiliate from './pages/dashboard/Affiliate';
import MyReviews from './pages/dashboard/MyReviews';
import Support from './pages/dashboard/Support';
import Beneficiaries from './pages/dashboard/Beneficiaries';
import { NotificationProvider } from './context/NotificationContext';
import ErrorBoundary from './components/common/ErrorBoundary';

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <NotificationProvider>
          <CookieConsent />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* User Routes */}
          <Route path="/dashboard" element={<UserLayout />}>
            <Route index element={<UserDashboard />} />
            <Route path="fund" element={<FundWallet />} />
            <Route path="data" element={<BuyData />} />
            <Route path="airtime" element={<BuyAirtime />} />
            <Route path="call-sub" element={<CallSub />} />
            <Route path="transfer" element={<Transfer />} />
            <Route path="bills" element={<PayBills />} />
            <Route path="education" element={<EducationPins />} />
            <Route path="bulk-sms" element={<BulkSMS />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="api-keys" element={<ApiKeys />} />
          <Route path="affiliate" element={<Affiliate />} />
          <Route path="reviews" element={<MyReviews />} />
          <Route path="support" element={<Support />} />
            <Route path="beneficiaries" element={<Beneficiaries />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin" element={<Layout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="treasury" element={<Treasury />} />
            <Route path="ogdams-data" element={<OgdamsDataPurchase />} />
            <Route path="wallet-deductions" element={<WalletDeductions />} />
            <Route path="call-sub" element={<CallSubAdmin />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="funding-review" element={<FundingReviews />} />
            <Route path="pricing" element={<AdminPricing />} />
            <Route path="kyc" element={<KycIndex />} />
            <Route path="subscriptions" element={<SubscriptionsIndex />} />
            <Route path="subscriptions/create" element={<CreateOrEditSubscriptionPlan />} />
            <Route path="subscriptions/edit/:id" element={<CreateOrEditSubscriptionPlan />} />
            <Route path="plans" element={<PlansIndex />} />
            <Route path="plans/create" element={<CreatePlan />} />
            <Route path="plans/edit/:id" element={<CreatePlan />} />
            <Route path="audit/price-history" element={<PriceHistory />} />
            <Route path="sims" element={<SimsIndex />} />
            <Route path="sims/create" element={<CreateSim />} />
            <Route path="bulk-sms" element={<BulkSMSIndex />} />
            <Route path="bulk-sms/create" element={<CreateBulkSMS />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reviews" element={<ReviewsIndex />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="support" element={<AdminSupport />} />
        </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
