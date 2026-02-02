import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Receipt, Tag, LogOut, Users, Settings, Database, Smartphone, BarChart3, MessageSquare } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex flex-col border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary-600">Peace Bundle</h1>
          <p className="text-xs text-gray-500 font-medium">Admin Console</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link 
            to="/admin" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 mr-3 ${isActive('/admin') ? 'text-primary-600' : 'text-gray-400'}`} />
            Dashboard
          </Link>
          
          <Link 
            to="/admin/users" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/users') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Users className={`w-5 h-5 mr-3 ${isActive('/admin/users') ? 'text-primary-600' : 'text-gray-400'}`} />
            Manage Users
          </Link>
          
          <Link 
            to="/admin/transactions" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/transactions') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Receipt className={`w-5 h-5 mr-3 ${isActive('/admin/transactions') ? 'text-primary-600' : 'text-gray-400'}`} />
            Transactions
          </Link>
          
          <Link 
            to="/admin/pricing" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/pricing') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Tag className={`w-5 h-5 mr-3 ${isActive('/admin/pricing') ? 'text-primary-600' : 'text-gray-400'}`} />
            Pricing
          </Link>

          <Link 
            to="/admin/plans" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/plans') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Database className={`w-5 h-5 mr-3 ${isActive('/admin/plans') ? 'text-primary-600' : 'text-gray-400'}`} />
            Data Plans
          </Link>

          <Link 
            to="/admin/sims" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/sims') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Smartphone className={`w-5 h-5 mr-3 ${isActive('/admin/sims') ? 'text-primary-600' : 'text-gray-400'}`} />
            SIM Management
          </Link>

          <Link 
            to="/admin/reports" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/reports') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <BarChart3 className={`w-5 h-5 mr-3 ${isActive('/admin/reports') ? 'text-primary-600' : 'text-gray-400'}`} />
            Reports
          </Link>

          <Link 
            to="/admin/support" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/support') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <MessageSquare className={`w-5 h-5 mr-3 ${isActive('/admin/support') ? 'text-primary-600' : 'text-gray-400'}`} />
            Support
          </Link>

          <Link 
            to="/admin/settings" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/admin/settings') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className={`w-5 h-5 mr-3 ${isActive('/admin/settings') ? 'text-primary-600' : 'text-gray-400'}`} />
            Settings
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <Link 
            to="/login" 
            className="flex items-center px-4 py-3 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors duration-200"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
