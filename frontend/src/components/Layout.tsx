import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Receipt, Tag, LogOut, Users, Settings, Database, Smartphone, 
  BarChart3, MessageSquare, Menu, X, ChevronLeft, ChevronRight, ShieldCheck, Bell, Star, Landmark, Wifi, MinusCircle, PhoneCall, History
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PageTransition from './animations/PageTransition';
import { useSidebar } from '../hooks/useSidebar';
import { useNotifications } from '../context/NotificationContext';
import BrandMark from './ui/BrandMark';
import LanguageSwitcher from './ui/LanguageSwitcher';
import ShellFrame from './ui/ShellFrame';

export default function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { isCollapsed, isMobileOpen, toggleCollapse, toggleMobile, closeMobile } = useSidebar();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getLinkClasses = (path: string) => `
    flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200
    ${isActive(path) 
      ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
    ${isCollapsed ? 'justify-center' : ''}
  `;

  const getIconClasses = (path: string) => `
    w-5 h-5 ${isCollapsed ? '' : 'mr-3'} 
    ${isActive(path) ? 'text-primary-600' : 'text-gray-400'}
  `;

  return (
    <ShellFrame>
    <div className="min-h-screen flex flex-col md:flex-row">
       {/* Mobile Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/50 bg-white/85 p-4 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-3">
            <BrandMark compact />
        </div>
        <div className="flex items-center gap-2">
            {/* Notification Bell for Mobile */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative rounded-2xl p-2 text-slate-600 hover:bg-slate-100"
              >
                <Bell size={24} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
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
                <BrandMark subtitle={t('nav.adminConsole')} />
                <LanguageSwitcher />
             </div>
          ) : (
             <BrandMark compact />
          )}
        </div>
        
        <nav className="flex-1 px-2 space-y-2 mt-4 overflow-y-auto pb-20 custom-scrollbar">
          <Link to="/admin" className={getLinkClasses('/admin')} title={isCollapsed ? t('common.dashboard') : ''}>
            <LayoutDashboard className={getIconClasses('/admin')} />
            {!isCollapsed && <span>{t('common.dashboard')}</span>}
          </Link>
          
          <Link to="/admin/users" className={getLinkClasses('/admin/users')} title={isCollapsed ? t('admin.users') : ''}>
            <Users className={getIconClasses('/admin/users')} />
            {!isCollapsed && <span>{t('admin.users')}</span>}
          </Link>
          
          <Link to="/admin/kyc" className={getLinkClasses('/admin/kyc')} title={isCollapsed ? t('admin.kycManagement') : ''}>
            <ShieldCheck className={getIconClasses('/admin/kyc')} />
            {!isCollapsed && <span>{t('admin.kycManagement')}</span>}
          </Link>
          
          <Link to="/admin/transactions" className={getLinkClasses('/admin/transactions')} title={isCollapsed ? t('dashboard.transactionsMenu') : ''}>
            <Receipt className={getIconClasses('/admin/transactions')} />
            {!isCollapsed && <span>{t('dashboard.transactionsMenu')}</span>}
          </Link>

          <Link to="/admin/funding-review" className={getLinkClasses('/admin/funding-review')} title={isCollapsed ? t('admin.fundingReview') : ''}>
            <Bell className={getIconClasses('/admin/funding-review')} />
            {!isCollapsed && <span>{t('admin.fundingReview')}</span>}
          </Link>
          
          <Link to="/admin/pricing" className={getLinkClasses('/admin/pricing')} title={isCollapsed ? t('admin.pricing') : ''}>
            <Tag className={getIconClasses('/admin/pricing')} />
            {!isCollapsed && <span>{t('admin.pricing')}</span>}
          </Link>

          <Link to="/admin/plans" className={getLinkClasses('/admin/plans')} title={isCollapsed ? t('admin.plans') : ''}>
            <Database className={getIconClasses('/admin/plans')} />
            {!isCollapsed && <span>{t('admin.plans')}</span>}
          </Link>

          <Link to="/admin/audit/price-history" className={getLinkClasses('/admin/audit/price-history')} title={isCollapsed ? t('admin.priceHistory') : ''}>
            <History className={getIconClasses('/admin/audit/price-history')} />
            {!isCollapsed && <span>{t('admin.priceHistory')}</span>}
          </Link>

          <Link to="/admin/subscriptions" className={getLinkClasses('/admin/subscriptions')} title={isCollapsed ? t('admin.subscriptions') : ''}>
            <Tag className={getIconClasses('/admin/subscriptions')} />
            {!isCollapsed && <span>{t('admin.subscriptions')}</span>}
          </Link>
          
          <Link to="/admin/sims" className={getLinkClasses('/admin/sims')} title={isCollapsed ? t('admin.manageSims') : ''}>
            <Smartphone className={getIconClasses('/admin/sims')} />
            {!isCollapsed && <span>{t('admin.simManagement')}</span>}
          </Link>

          <Link to="/admin/ogdams-data" className={getLinkClasses('/admin/ogdams-data')} title={isCollapsed ? t('admin.adminData') : ''}>
            <Wifi className={getIconClasses('/admin/ogdams-data')} />
            {!isCollapsed && <span>{t('admin.adminData')}</span>}
          </Link>

          <Link to="/admin/wallet-deductions" className={getLinkClasses('/admin/wallet-deductions')} title={isCollapsed ? t('admin.walletDeduct') : ''}>
            <MinusCircle className={getIconClasses('/admin/wallet-deductions')} />
            {!isCollapsed && <span>{t('admin.walletDeduct')}</span>}
          </Link>

          <Link to="/admin/call-sub" className={getLinkClasses('/admin/call-sub')} title={isCollapsed ? t('admin.callSub') : ''}>
            <PhoneCall className={getIconClasses('/admin/call-sub')} />
            {!isCollapsed && <span>{t('admin.callSub')}</span>}
          </Link>

          <Link to="/admin/bulk-sms" className={getLinkClasses('/admin/bulk-sms')} title={isCollapsed ? t('admin.bulkSms') : ''}>
            <MessageSquare className={getIconClasses('/admin/bulk-sms')} />
            {!isCollapsed && <span>{t('admin.bulkSms')}</span>}
          </Link>

          <Link to="/admin/reports" className={getLinkClasses('/admin/reports')} title={isCollapsed ? t('admin.reports') : ''}>
            <BarChart3 className={getIconClasses('/admin/reports')} />
            {!isCollapsed && <span>{t('admin.reports')}</span>}
          </Link>

          <Link to="/admin/treasury" className={getLinkClasses('/admin/treasury')} title={isCollapsed ? t('admin.treasury') : ''}>
            <Landmark className={getIconClasses('/admin/treasury')} />
            {!isCollapsed && <span>{t('admin.treasury')}</span>}
          </Link>

          <Link to="/admin/reviews" className={getLinkClasses('/admin/reviews')} title={isCollapsed ? t('admin.reviews') : ''}>
            <Star className={getIconClasses('/admin/reviews')} />
            {!isCollapsed && <span>{t('admin.reviews')}</span>}
          </Link>

          <Link to="/admin/support" className={getLinkClasses('/admin/support')} title={isCollapsed ? t('common.support') : ''}>
            <MessageSquare className={getIconClasses('/admin/support')} />
            {!isCollapsed && <span>{t('common.support')}</span>}
          </Link>

          <Link to="/admin/settings" className={getLinkClasses('/admin/settings')} title={isCollapsed ? t('common.settings') : ''}>
            <Settings className={getIconClasses('/admin/settings')} />
            {!isCollapsed && <span>{t('common.settings')}</span>}
          </Link>
        </nav>

        <div className={`absolute bottom-0 border-t border-white/60 bg-white/90 p-4 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
          <Link 
            to="/login" 
            className={`flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? t('common.logout') : ''}
          >
            <LogOut className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'}`} />
            {!isCollapsed && <span>{t('common.logout')}</span>}
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`ml-0 w-full flex-1 overflow-y-auto p-4 transition-all duration-300 md:p-8 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
    </ShellFrame>
  );
}
