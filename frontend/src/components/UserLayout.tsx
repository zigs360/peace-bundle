import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Wallet, Wifi, Phone, Receipt, Settings, LogOut, Tv, 
  GraduationCap, Users, MessageSquare, Key, Share2, Menu, X, ChevronLeft, ChevronRight, ShieldCheck, Bell, Banknote, PhoneCall 
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PageTransition from './animations/PageTransition';
import api from '../services/api';
import { useSidebar } from '../hooks/useSidebar';
import { useNotifications } from '../context/NotificationContext';
import ReviewModal from './ReviewModal';

export default function UserLayout() {
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
    const message = encodeURIComponent('Hello Peace Bundlle Support, I need assistance with my account.');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    
    try {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('WhatsApp redirect failed:', error);
      window.location.href = whatsappUrl;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold text-primary-600">Peace Bundlle</h1>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={toggleMobile} 
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Toggle menu"
            >
                {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
        </div>
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

        <ReviewModal />
        
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

          <Link to="/dashboard/airtime" className={getLinkClasses('/dashboard/airtime')} title={isCollapsed ? "Airtime" : ""}>
            <Phone className={getIconClasses('/dashboard/airtime')} />
            {!isCollapsed && <span>Airtime</span>}
          </Link>

          <Link to="/dashboard/airtel-talk-more" className={getLinkClasses('/dashboard/airtel-talk-more')} title={isCollapsed ? "Talk More" : ""}>
            <PhoneCall className={getIconClasses('/dashboard/airtel-talk-more')} />
            {!isCollapsed && <span>Airtel Talk More</span>}
          </Link>

          <Link to="/dashboard/transfer" className={getLinkClasses('/dashboard/transfer')} title={isCollapsed ? "Transfer" : ""}>
            <Banknote className={getIconClasses('/dashboard/transfer')} />
            {!isCollapsed && <span>Transfer</span>}
          </Link>
          
          <Link to="/dashboard/bills" className={getLinkClasses('/dashboard/bills')} title={isCollapsed ? "Bills" : ""}>
            <Tv className={getIconClasses('/dashboard/bills')} />
            {!isCollapsed && <span>Pay Bills</span>}
          </Link>

          <Link to="/dashboard/education" className={getLinkClasses('/dashboard/education')} title={isCollapsed ? "Education" : ""}>
            <GraduationCap className={getIconClasses('/dashboard/education')} />
            {!isCollapsed && <span>Education</span>}
          </Link>

          <button 
            onClick={handleSupportClick}
            className={getLinkClasses('/dashboard/support')} 
            title={isCollapsed ? "Support" : ""}
          >
            <MessageSquare className={getIconClasses('/dashboard/support')} />
            {!isCollapsed && <span>Support</span>}
          </button>
          
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
      <main className={`flex-1 overflow-y-auto w-full transition-all duration-300 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'} ml-0`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 py-3 px-6 flex justify-end items-center sticky top-0 z-20 h-16">
          <div className="flex items-center gap-4">
            {/* Notification Icon */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 relative transition-colors"
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
                    className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                      <h3 className="font-bold text-gray-800">Notifications</h3>
                      {unreadCount > 0 && (
                        <button 
                          onClick={markAllAsRead}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                          <p className="text-gray-400 text-sm">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div 
                            key={n.id} 
                            onClick={() => !n.isRead && markAsRead(n.id)}
                            className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!n.isRead ? 'bg-primary-50/30' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-xs font-bold uppercase tracking-wider ${
                                n.type === 'success' ? 'text-green-600' : 
                                n.type === 'error' ? 'text-red-600' : 
                                n.type === 'warning' ? 'text-orange-600' : 'text-primary-600'
                              }`}>
                                {n.type}
                              </span>
                              <span className="text-[10px] text-gray-400 italic">
                                {new Date(n.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 className={`text-sm font-semibold text-gray-800 ${!n.isRead ? 'pr-3 relative' : ''}`}>
                              {n.title}
                              {!n.isRead && <span className="absolute right-0 top-1.5 w-2 h-2 bg-primary-500 rounded-full" />}
                            </h4>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{n.message}</p>
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
                className="flex items-center gap-3 p-1.5 rounded-full hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200"
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
                    className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
                  >
                    <div className="p-4 bg-gray-50/50 border-b border-gray-100">
                      <p className="text-sm font-bold text-gray-800 truncate">{user?.fullName || user?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <div className="p-2">
                      <Link 
                        to="/dashboard/settings" 
                        className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-primary-600 rounded-lg transition-colors"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <Settings size={18} />
                        Profile Settings
                      </Link>
                      <Link 
                        to="/dashboard/transactions" 
                        className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-primary-600 rounded-lg transition-colors"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <Receipt size={18} />
                        Transactions
                      </Link>
                      <div className="my-1 border-t border-gray-50" />
                      <button 
                        onClick={() => {
                          localStorage.removeItem('token');
                          localStorage.removeItem('user');
                          window.location.href = '/login';
                        }}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left rounded-lg transition-colors font-medium"
                      >
                        <LogOut size={18} />
                        Sign Out
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
  );
}
