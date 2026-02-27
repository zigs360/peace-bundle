import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Wallet, Wifi, Phone, Receipt, Settings, LogOut, Tv, 
  GraduationCap, Users, MessageSquare, Key, Share2, Menu, X, ChevronLeft, ChevronRight, ShieldCheck 
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import PageTransition from './animations/PageTransition';
import api from '../services/api';
import { useSidebar } from '../hooks/useSidebar';

export default function UserLayout() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const [userRole, setUserRole] = useState<string>('user');
  const { isCollapsed, isMobileOpen, toggleCollapse, toggleMobile, closeMobile } = useSidebar();

  useEffect(() => {
    // Fetch user profile to get role
    api.get('/auth/profile').then(res => {
      setUserRole((res.data as any).role);
    }).catch(err => console.error('Failed to fetch user role', err));
  }, []);

  // Helper for Link classes
  const getLinkClasses = (path: string) => `
    flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200
    ${isActive(path) 
      ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
    ${isCollapsed ? 'justify-center' : ''}
  `;

  // Helper for Icon classes
  const getIconClasses = (path: string) => `
    w-5 h-5 ${isCollapsed ? '' : 'mr-3'} 
    ${isActive(path) ? 'text-primary-600' : 'text-gray-400'}
  `;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold text-primary-600">Peace Bundlle</h1>
        </div>
        <button 
            onClick={toggleMobile} 
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Toggle menu"
        >
            {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
            onClick={closeMobile}
            aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
            bg-white shadow-md flex flex-col border-r border-gray-200 
            fixed top-0 h-full z-40 transition-all duration-300 ease-in-out
            ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            ${isCollapsed ? 'md:w-20' : 'md:w-64'}
            w-64
        `}
        aria-label="Sidebar"
        aria-expanded={!isCollapsed}
      >
        <div className={`p-6 relative ${isCollapsed ? 'flex justify-center px-2' : ''}`}>
          {/* Desktop Toggle Button */}
          <button 
            onClick={toggleCollapse} 
            className="absolute -right-3 top-8 bg-white border border-gray-200 rounded-full p-1.5 shadow-sm hover:bg-gray-50 text-gray-500 hidden md:flex items-center justify-center z-50"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
          </button>

          {!isCollapsed ? (
             <div className="flex items-center gap-3 mb-1">
                <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
                <div className="overflow-hidden">
                    <h1 className="text-2xl font-bold text-primary-600 truncate">Peace Bundlle</h1>
                </div>
             </div>
          ) : (
             <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          )}
          {!isCollapsed && <p className="text-xs text-gray-500 font-medium pl-11 truncate">User Dashboard</p>}
        </div>
        
        <nav className="flex-1 px-2 space-y-2 mt-4 overflow-y-auto pb-20 custom-scrollbar">
          <Link to="/dashboard" className={getLinkClasses('/dashboard')} title={isCollapsed ? "Dashboard" : ""}>
            <LayoutDashboard className={getIconClasses('/dashboard')} />
            {!isCollapsed && <span>Dashboard</span>}
          </Link>

          <Link to="/dashboard/fund" className={getLinkClasses('/dashboard/fund')} title={isCollapsed ? "Fund Wallet" : ""}>
            <Wallet className={getIconClasses('/dashboard/fund')} />
            {!isCollapsed && <span>Fund Wallet</span>}
          </Link>
          
          <Link to="/dashboard/data" className={getLinkClasses('/dashboard/data')} title={isCollapsed ? "Buy Data" : ""}>
            <Wifi className={getIconClasses('/dashboard/data')} />
            {!isCollapsed && <span>Buy Data</span>}
          </Link>

          <Link to="/dashboard/airtime" className={getLinkClasses('/dashboard/airtime')} title={isCollapsed ? "Buy Airtime" : ""}>
            <Phone className={getIconClasses('/dashboard/airtime')} />
            {!isCollapsed && <span>Buy Airtime</span>}
          </Link>

          <Link to="/dashboard/bills" className={getLinkClasses('/dashboard/bills')} title={isCollapsed ? "Pay Bills" : ""}>
            <Tv className={getIconClasses('/dashboard/bills')} />
            {!isCollapsed && <span>Pay Bills</span>}
          </Link>

          <Link to="/dashboard/education" className={getLinkClasses('/dashboard/education')} title={isCollapsed ? "Education" : ""}>
            <GraduationCap className={getIconClasses('/dashboard/education')} />
            {!isCollapsed && <span>Education</span>}
          </Link>

          <Link to="/dashboard/support" className={getLinkClasses('/dashboard/support')} title={isCollapsed ? "Support Tickets" : ""}>
            <MessageSquare className={getIconClasses('/dashboard/support')} />
            {!isCollapsed && <span>Support Tickets</span>}
          </Link>
          
          <Link to="/dashboard/bulk-sms" className={getLinkClasses('/dashboard/bulk-sms')} title={isCollapsed ? "Bulk SMS" : ""}>
            <MessageSquare className={getIconClasses('/dashboard/bulk-sms')} />
            {!isCollapsed && <span>Bulk SMS</span>}
          </Link>

          {(userRole === 'reseller' || userRole === 'admin') && (
            <>
              <Link to="/admin/sims" className={getLinkClasses('/admin/sims')} title={isCollapsed ? "SIM Management" : ""}>
                <Users className={getIconClasses('/admin/sims')} />
                {!isCollapsed && <span>SIM Management</span>}
              </Link>

              {userRole === 'admin' && (
                <Link to="/admin/kyc" className={getLinkClasses('/admin/kyc')} title={isCollapsed ? "KYC Management" : ""}>
                  <ShieldCheck className={getIconClasses('/admin/kyc')} />
                  {!isCollapsed && <span>KYC Management</span>}
                </Link>
              )}
            </>
          )}

          <Link to="/dashboard/transactions" className={getLinkClasses('/dashboard/transactions')} title={isCollapsed ? "Transactions" : ""}>
            <Receipt className={getIconClasses('/dashboard/transactions')} />
            {!isCollapsed && <span>Transactions</span>}
          </Link>

          {(userRole === 'reseller' || userRole === 'admin') && (
            <>
              <Link to="/dashboard/api-keys" className={getLinkClasses('/dashboard/api-keys')} title={isCollapsed ? "API Keys" : ""}>
                <Key className={getIconClasses('/dashboard/api-keys')} />
                {!isCollapsed && <span>API Keys</span>}
              </Link>
              
              <Link to="/dashboard/affiliate" className={getLinkClasses('/dashboard/affiliate')} title={isCollapsed ? "Affiliate" : ""}>
                <Share2 className={getIconClasses('/dashboard/affiliate')} />
                {!isCollapsed && <span>Affiliate</span>}
              </Link>
            </>
          )}

          <Link to="/dashboard/beneficiaries" className={getLinkClasses('/dashboard/beneficiaries')} title={isCollapsed ? "Beneficiaries" : ""}>
            <Users className={getIconClasses('/dashboard/beneficiaries')} />
            {!isCollapsed && <span>Beneficiaries</span>}
          </Link>

          <Link to="/dashboard/settings" className={getLinkClasses('/dashboard/settings')} title={isCollapsed ? "Settings" : ""}>
            <Settings className={getIconClasses('/dashboard/settings')} />
            {!isCollapsed && <span>Settings</span>}
          </Link>
        </nav>

        <div className={`p-4 border-t border-gray-200 bg-white absolute bottom-0 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
          <Link 
            to="/login" 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
            }}
            className={`flex items-center px-4 py-3 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors duration-200 ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? "Logout" : ""}
          >
            <LogOut className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'}`} />
            {!isCollapsed && <span>Logout</span>}
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 p-4 md:p-8 overflow-y-auto w-full transition-all duration-300 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'} ml-0`}>
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  );
}
