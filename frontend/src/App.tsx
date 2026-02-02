import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Layout from './components/Layout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import Transactions from './pages/admin/AdminTransactionsPage';
import Pricing from './pages/Pricing';
import PlansIndex from './pages/admin/Plans/Index';
import CreatePlan from './pages/admin/Plans/Create';
import SimsIndex from './pages/admin/Sims/Index';
import CreateSim from './pages/admin/Sims/Create';
import Reports from './pages/admin/Reports';
import AdminSettings from './pages/admin/AdminSettings';
import AdminSupport from './pages/admin/Support';
import UserLayout from './components/UserLayout';
import UserDashboard from './pages/dashboard/UserDashboard';
import FundWallet from './pages/dashboard/FundWallet';
import BuyData from './pages/dashboard/BuyData';
import BuyAirtime from './pages/dashboard/BuyAirtime';
import PayBills from './pages/dashboard/PayBills';
import EducationPins from './pages/dashboard/EducationPins';
import BulkSMS from './pages/dashboard/BulkSMS';
import TransactionsPage from './pages/dashboard/TransactionsPage';
import Settings from './pages/dashboard/Settings';
import ApiKeys from './pages/dashboard/ApiKeys';
import Affiliate from './pages/dashboard/Affiliate';
import Support from './pages/dashboard/Support';

function App() {
  return (
    <Router>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* User Routes */}
        <Route path="/dashboard" element={<UserLayout />}>
          <Route index element={<UserDashboard />} />
          <Route path="fund" element={<FundWallet />} />
          <Route path="data" element={<BuyData />} />
          <Route path="airtime" element={<BuyAirtime />} />
          <Route path="bills" element={<PayBills />} />
          <Route path="education" element={<EducationPins />} />
          <Route path="bulk-sms" element={<BulkSMS />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="api-keys" element={<ApiKeys />} />
          <Route path="affiliate" element={<Affiliate />} />
          <Route path="support" element={<Support />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={<Layout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="plans" element={<PlansIndex />} />
          <Route path="plans/create" element={<CreatePlan />} />
          <Route path="sims" element={<SimsIndex />} />
          <Route path="sims/create" element={<CreateSim />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="support" element={<AdminSupport />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
