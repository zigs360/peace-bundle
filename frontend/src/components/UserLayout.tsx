import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Wallet, Wifi, Phone, Receipt, Settings, LogOut, Tv, 
  GraduationCap, Users, MessageSquare, Key, Share2, Menu, X, ChevronLeft, ChevronRight, ShieldCheck, Bell, Banknote, PhoneCall 
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import PageTransition from './animations/PageTransition';
import api from '../services/api';
import { useSidebar } from '../hooks/useSidebar';
import { useNotifications } from '../context/NotificationContext';
import ReviewModal from './ReviewModal';
import BrandMark from './ui/BrandMark';
import LanguageSwitcher from './ui/LanguageSwitcher';
import ShellFrame from './ui/ShellFrame';

export default function UserLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const [userRole, setUserRole] = useState<string>('user');
  const { isCollapsed, isMobileOpen, toggleCollapse, toggleMobile, closeMobile } = useSidebar();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Fetch user profile
    api.get('/auth/profile').then(res => {
      setUser(res.data);
      setUserRole((res.data as any).role);
    }).catch(err => console.error('Failed to fetch user profile', err));
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

  const handleSupportClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const phoneNumber = '2348035446865';
    const message = encodeURIComponent('Hello Peace Bundle Support, I need assistance with my account.');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    
    try {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('WhatsApp redirect failed:', error);
      window.location.href = whatsappUrl;
    }
  };

  return (
    <ShellFrame>
    <div className="min-h-screen flex flex-col md:flex-row">
      
      {/* Mobile Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/50 bg-white/85 p-4 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-3">
            <BrandMark compact />
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={toggleMobile} 
                className="rounded-2xl p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Toggle menu"
            >
                {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div 
            className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden"
            onClick={closeMobile}
            aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
            flex flex-col border-r border-white/60 bg-white/90 shadow-soft-lg backdrop-blur-xl
            fixed top-0 h-full z-40 transition-all duration-300 ease-in-out
            ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            ${isCollapsed ? 'md:w-20' : 'md:w-64'}
            w-64
        `}
        aria-label="Sidebar"
        aria-expanded={!isCollapsed}
      >
        <div className={`relative p-6 ${isCollapsed ? 'flex justify-center px-2' : ''}`}>
          {/* Desktop Toggle Button */}
          <button 
            onClick={toggleCollapse} 
            className="absolute -right-3 top-8 z-50 hidden items-center justify-center rounded-full border border-white/60 bg-white p-1.5 text-slate-500 shadow-soft hover:bg-slate-50 md:flex"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
          </button>

          {!isCollapsed ? (
             <div className="space-y-4">
                <BrandMark subtitle={t('nav.userDashboard')} />
                <LanguageSwitcher />
             </div>
          ) : (
             <BrandMark compact />
          )}
        </div>

        <ReviewModal />
        
        <nav className="flex-1 px-2 space-y-2 mt-4 overflow-y-auto pb-20 custom-scrollbar">
          <Link to="/dashboard" className={getLinkClasses('/dashboard')} title={isCollapsed ? t('common.dashboard') : ''}>
            <LayoutDashboard className={getIconClasses('/dashboard')} />
            {!isCollapsed && <span>{t('common.dashboard')}</span>}
          </Link>

          <Link to="/dashboard/fund" className={getLinkClasses('/dashboard/fund')} title={isCollapsed ? t('dashboard.fundWallet') : ''}>
            <Wallet className={getIconClasses('/dashboard/fund')} />
            {!isCollapsed && <span>{t('dashboard.fundWallet')}</span>}
          </Link>
          
          <Link to="/dashboard/data" className={getLinkClasses('/dashboard/data')} title={isCollapsed ? t('dashboard.buyData') : ''}>
            <Wifi className={getIconClasses('/dashboard/data')} />
            {!isCollapsed && <span>{t('dashboard.buyData')}</span>}
          </Link>

          <Link to="/dashboard/airtime" className={getLinkClasses('/dashboard/airtime')} title={isCollapsed ? t('dashboard.buyAirtime') : ''}>
            <Phone className={getIconClasses('/dashboard/airtime')} />
            {!isCollapsed && <span>{t('dashboard.buyAirtime')}</span>}
          </Link>

          <Link to="/dashboard/call-sub" className={getLinkClasses('/dashboard/call-sub')} title={isCollapsed ? t('admin.callSub') : ''}>
            <PhoneCall className={getIconClasses('/dashboard/call-sub')} />
            {!isCollapsed && <span>{t('admin.callSub')}</span>}
          </Link>

          <Link to="/dashboard/transfer" className={getLinkClasses('/dashboard/transfer')} title={isCollapsed ? t('dashboard.transfer') : ''}>
            <Banknote className={getIconClasses('/dashboard/transfer')} />
            {!isCollapsed && <span>{t('dashboard.transfer')}</span>}
          </Link>
          
          <Link to="/dashboard/bills" className={getLinkClasses('/dashboard/bills')} title={isCollapsed ? t('dashboard.payBills') : ''}>
            <Tv className={getIconClasses('/dashboard/bills')} />
            {!isCollapsed && <span>{t('dashboard.payBills')}</span>}
          </Link>

          <Link to="/dashboard/education" className={getLinkClasses('/dashboard/education')} title={isCollapsed ? t('dashboard.education') : ''}>
            <GraduationCap className={getIconClasses('/dashboard/education')} />
            {!isCollapsed && <span>{t('dashboard.education')}</span>}
          </Link>

          <button 
            onClick={handleSupportClick}
            className={getLinkClasses('/dashboard/support')} 
            title={isCollapsed ? t('common.support') : ''}
          >
            <MessageSquare className={getIconClasses('/dashboard/support')} />
            {!isCollapsed && <span>{t('common.support')}</span>}
          </button>
          
          <Link to="/dashboard/bulk-sms" className={getLinkClasses('/dashboard/bulk-sms')} title={isCollapsed ? t('dashboard.bulkSms') : ''}>
            <MessageSquare className={getIconClasses('/dashboard/bulk-sms')} />
            {!isCollapsed && <span>{t('dashboard.bulkSms')}</span>}
          </Link>

          {(userRole === 'reseller' || userRole === 'admin') && (
            <>
              <Link to="/admin/sims" className={getLinkClasses('/admin/sims')} title={isCollapsed ? t('admin.simManagement') : ''}>
                <Users className={getIconClasses('/admin/sims')} />
                {!isCollapsed && <span>{t('admin.simManagement')}</span>}
              </Link>

              {userRole === 'admin' && (
                <Link to="/admin/kyc" className={getLinkClasses('/admin/kyc')} title={isCollapsed ? t('admin.kycManagement') : ''}>
                  <ShieldCheck className={getIconClasses('/admin/kyc')} />
                  {!isCollapsed && <span>{t('admin.kycManagement')}</span>}
                </Link>
              )}
            </>
          )}

          <Link to="/dashboard/transactions" className={getLinkClasses('/dashboard/transactions')} title={isCollapsed ? t('dashboard.transactionsMenu') : ''}>
            <Receipt className={getIconClasses('/dashboard/transactions')} />
            {!isCollapsed && <span>{t('dashboard.transactionsMenu')}</span>}
          </Link>

          {(userRole === 'reseller' || userRole === 'admin') && (
            <>
              <Link to="/dashboard/api-keys" className={getLinkClasses('/dashboard/api-keys')} title={isCollapsed ? t('dashboard.apiKeys') : ''}>
                <Key className={getIconClasses('/dashboard/api-keys')} />
                {!isCollapsed && <span>{t('dashboard.apiKeys')}</span>}
              </Link>
              
              <Link to="/dashboard/affiliate" className={getLinkClasses('/dashboard/affiliate')} title={isCollapsed ? t('dashboard.affiliate') : ''}>
                <Share2 className={getIconClasses('/dashboard/affiliate')} />
                {!isCollapsed && <span>{t('dashboard.affiliate')}</span>}
              </Link>
            </>
          )}

          <Link to="/dashboard/beneficiaries" className={getLinkClasses('/dashboard/beneficiaries')} title={isCollapsed ? t('dashboard.beneficiaries') : ''}>
            <Users className={getIconClasses('/dashboard/beneficiaries')} />
            {!isCollapsed && <span>{t('dashboard.beneficiaries')}</span>}
          </Link>

          <Link to="/dashboard/settings" className={getLinkClasses('/dashboard/settings')} title={isCollapsed ? t('common.settings') : ''}>
            <Settings className={getIconClasses('/dashboard/settings')} />
            {!isCollapsed && <span>{t('common.settings')}</span>}
          </Link>
        </nav>

        <div className={`absolute bottom-0 border-t border-white/60 bg-white/90 p-4 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
          <Link 
            to="/login" 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
            }}
            className={`flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? t('common.logout') : ''}
          >
            <LogOut className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'}`} />
            {!isCollapsed && <span>{t('common.logout')}</span>}
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`ml-0 w-full flex-1 overflow-y-auto transition-all duration-300 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-white/60 bg-white/82 px-6 py-3 backdrop-blur-xl">
          <div className="hidden md:block">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-700">{t('dashboard.operationsWorkspace')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('dashboard.operationsWorkspaceDescription')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>
            {/* Notification Icon */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative rounded-2xl p-2 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
                    {unreadCount}
                  </span>
                )}
              </button>
              
              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-3xl border border-white/60 bg-white shadow-soft-lg"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-4">
                      <h3 className="font-bold text-slate-800">{t('common.notifications')}</h3>
                      {unreadCount > 0 && (
                        <button 
                          onClick={markAllAsRead}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          {t('common.markAllAsRead')}
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                          <p className="text-sm text-slate-400">{t('common.noNotifications')}</p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div 
                            key={n.id} 
                            onClick={() => !n.isRead && markAsRead(n.id)}
                            className={`cursor-pointer border-b border-slate-50 p-4 transition-colors hover:bg-slate-50 ${!n.isRead ? 'bg-primary-50/30' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-xs font-bold uppercase tracking-wider ${
                                n.type === 'success' ? 'text-green-600' : 
                                n.type === 'error' ? 'text-red-600' : 
                                n.type === 'warning' ? 'text-orange-600' : 'text-primary-600'
                              }`}>
                                {n.type}
                              </span>
                              <span className="text-[10px] italic text-slate-400">
                                {new Date(n.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 className={`text-sm font-semibold text-slate-800 ${!n.isRead ? 'relative pr-3' : ''}`}>
                              {n.title}
                              {!n.isRead && <span className="absolute right-0 top-1.5 w-2 h-2 bg-primary-500 rounded-full" />}
                            </h4>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Picture & Dropdown */}
            <div className="relative" ref={profileRef}>
              <button 
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-3 rounded-full border border-transparent p-1.5 transition-all hover:border-slate-200 hover:bg-slate-100"
              >
                <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden shadow-sm">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    (user?.fullName || user?.name || 'U').charAt(0)
                  )}
                </div>
              </button>

              <AnimatePresence>
                {showProfileDropdown && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-3xl border border-white/60 bg-white shadow-soft-lg"
                  >
                    <div className="border-b border-slate-100 bg-slate-50/70 p-4">
                      <p className="truncate text-sm font-bold text-slate-800">{user?.fullName || user?.name}</p>
                      <p className="truncate text-xs text-slate-500">{user?.email}</p>
                    </div>
                    <div className="p-2">
                      <Link 
                        to="/dashboard/settings" 
                        className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary-600"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <Settings size={18} />
                        {t('common.profileSettings')}
                      </Link>
                      <Link 
                        to="/dashboard/transactions" 
                        className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary-600"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <Receipt size={18} />
                        {t('dashboard.transactionsMenu')}
                      </Link>
                      <div className="my-1 border-t border-slate-50" />
                      <button 
                        onClick={() => {
                          localStorage.removeItem('token');
                          localStorage.removeItem('user');
                          window.location.href = '/login';
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        <LogOut size={18} />
                        {t('common.signOut')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </div>
      </main>
    </div>
    </ShellFrame>
  );
}
