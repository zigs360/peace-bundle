import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Receipt, Tag, LogOut, Users, Settings, Database, Smartphone, 
  BarChart3, MessageSquare, Menu, X, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import PageTransition from './animations/PageTransition';
import { useSidebar } from '../hooks/useSidebar';

export default function Layout() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { isCollapsed, isMobileOpen, toggleCollapse, toggleMobile, closeMobile } = useSidebar();

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

          <Link to="/admin/sims" className={getLinkClasses('/admin/sims')} title={isCollapsed ? "SIM Management" : ""}>
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
