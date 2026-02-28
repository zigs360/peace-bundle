import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Receipt, Tag, LogOut, Users, Settings, Database, Smartphone, 
  BarChart3, MessageSquare, Menu, X, ChevronLeft, ChevronRight, ShieldCheck, Bell, Star 
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import PageTransition from './animations/PageTransition';
import { useSidebar } from '../hooks/useSidebar';
import { useNotifications } from '../context/NotificationContext';

export default function Layout() {
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
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
       {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold text-primary-600">Peace Bundlle</h1>
        </div>
        <div className="flex items-center gap-2">
            {/* Notification Bell for Mobile */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 relative"
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
                    <p className="text-xs text-gray-500 font-medium truncate">Admin Console</p>
                </div>
             </div>
          ) : (
             <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          )}
        </div>
        
        <nav className="flex-1 px-2 space-y-2 mt-4 overflow-y-auto pb-20 custom-scrollbar">
          <Link to="/admin" className={getLinkClasses('/admin')} title={isCollapsed ? "Dashboard" : ""}>
            <LayoutDashboard className={getIconClasses('/admin')} />
            {!isCollapsed && <span>Dashboard</span>}
          </Link>
          
          <Link to="/admin/users" className={getLinkClasses('/admin/users')} title={isCollapsed ? "Manage Users" : ""}>
            <Users className={getIconClasses('/admin/users')} />
            {!isCollapsed && <span>Manage Users</span>}
          </Link>
          
          <Link to="/admin/kyc" className={getLinkClasses('/admin/kyc')} title={isCollapsed ? "KYC Management" : ""}>
            <ShieldCheck className={getIconClasses('/admin/kyc')} />
            {!isCollapsed && <span>KYC Management</span>}
          </Link>
          
          <Link to="/admin/transactions" className={getLinkClasses('/admin/transactions')} title={isCollapsed ? "Transactions" : ""}>
            <Receipt className={getIconClasses('/admin/transactions')} />
            {!isCollapsed && <span>Transactions</span>}
          </Link>
          
          <Link to="/admin/pricing" className={getLinkClasses('/admin/pricing')} title={isCollapsed ? "Pricing" : ""}>
            <Tag className={getIconClasses('/admin/pricing')} />
            {!isCollapsed && <span>Pricing</span>}
          </Link>

          <Link to="/admin/plans" className={getLinkClasses('/admin/plans')} title={isCollapsed ? "Data Plans" : ""}>
            <Database className={getIconClasses('/admin/plans')} />
            {!isCollapsed && <span>Data Plans</span>}
          </Link>

          <Link to="/admin/subscriptions" className={getLinkClasses('/admin/subscriptions')} title={isCollapsed ? "Subscription Plans" : ""}>
            <Tag className={getIconClasses('/admin/subscriptions')} />
            {!isCollapsed && <span>Subscription Plans</span>}
          </Link>
          
          <Link to="/admin/sims" className={getLinkClasses('/admin/sims')} title={isCollapsed ? "Manage SIMs" : ""}>
            <Smartphone className={getIconClasses('/admin/sims')} />
            {!isCollapsed && <span>SIM Management</span>}
          </Link>

          <Link to="/admin/bulk-sms" className={getLinkClasses('/admin/bulk-sms')} title={isCollapsed ? "Bulk SMS" : ""}>
            <MessageSquare className={getIconClasses('/admin/bulk-sms')} />
            {!isCollapsed && <span>Bulk SMS</span>}
          </Link>

          <Link to="/admin/reports" className={getLinkClasses('/admin/reports')} title={isCollapsed ? "Reports" : ""}>
            <BarChart3 className={getIconClasses('/admin/reports')} />
            {!isCollapsed && <span>Reports</span>}
          </Link>

          <Link to="/admin/reviews" className={getLinkClasses('/admin/reviews')} title={isCollapsed ? "Reviews" : ""}>
            <Star className={getIconClasses('/admin/reviews')} />
            {!isCollapsed && <span>Reviews</span>}
          </Link>

          <Link to="/admin/support" className={getLinkClasses('/admin/support')} title={isCollapsed ? "Support" : ""}>
            <MessageSquare className={getIconClasses('/admin/support')} />
            {!isCollapsed && <span>Support</span>}
          </Link>

          <Link to="/admin/settings" className={getLinkClasses('/admin/settings')} title={isCollapsed ? "Settings" : ""}>
            <Settings className={getIconClasses('/admin/settings')} />
            {!isCollapsed && <span>Settings</span>}
          </Link>
        </nav>

        <div className={`p-4 border-t border-gray-200 bg-white absolute bottom-0 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
          <Link 
            to="/login" 
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
