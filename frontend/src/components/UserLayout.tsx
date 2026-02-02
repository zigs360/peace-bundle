import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, Wifi, Phone, Receipt, Settings, LogOut, Tv, GraduationCap, Users, MessageSquare, Key, Share2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../services/api';

export default function UserLayout() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const [userRole, setUserRole] = useState<string>('user');

  useEffect(() => {
    // Fetch user profile to get role
    api.get('/auth/profile').then(res => {
      setUserRole((res.data as any).role);
    }).catch(err => console.error('Failed to fetch user role', err));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex flex-col border-r border-gray-200 fixed h-full z-10">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary-600">Peace Bundle</h1>
          <p className="text-xs text-gray-500 font-medium">User Dashboard</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto pb-20">
          <Link 
            to="/dashboard" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 mr-3 ${isActive('/dashboard') ? 'text-primary-600' : 'text-gray-400'}`} />
            Dashboard
          </Link>

          <Link 
            to="/dashboard/fund" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/fund') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Wallet className={`w-5 h-5 mr-3 ${isActive('/dashboard/fund') ? 'text-primary-600' : 'text-gray-400'}`} />
            Fund Wallet
          </Link>
          
          <Link 
            to="/dashboard/data" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/data') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Wifi className={`w-5 h-5 mr-3 ${isActive('/dashboard/data') ? 'text-primary-600' : 'text-gray-400'}`} />
            Buy Data
          </Link>

          <Link 
            to="/dashboard/airtime" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/airtime') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Phone className={`w-5 h-5 mr-3 ${isActive('/dashboard/airtime') ? 'text-primary-600' : 'text-gray-400'}`} />
            Buy Airtime
          </Link>

          <Link 
            to="/dashboard/bills" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/bills') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Tv className={`w-5 h-5 mr-3 ${isActive('/dashboard/bills') ? 'text-primary-600' : 'text-gray-400'}`} />
            Pay Bills
          </Link>

          <Link 
            to="/dashboard/education" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/education') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <GraduationCap className={`w-5 h-5 mr-3 ${isActive('/dashboard/education') ? 'text-primary-600' : 'text-gray-400'}`} />
            Education
          </Link>

          <Link 
            to="/dashboard/support" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/support') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <MessageSquare className={`w-5 h-5 mr-3 ${isActive('/dashboard/support') ? 'text-primary-600' : 'text-gray-400'}`} />
            Support Tickets
          </Link>
          
          <Link 
            to="/dashboard/bulk-sms" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/bulk-sms') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <MessageSquare className={`w-5 h-5 mr-3 ${isActive('/dashboard/bulk-sms') ? 'text-primary-600' : 'text-gray-400'}`} />
            Bulk SMS
          </Link>

          {(userRole === 'reseller' || userRole === 'admin') && (
            <Link 
              to="/admin/sims" 
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                isActive('/admin/sims') 
                  ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Users className={`w-5 h-5 mr-3 ${isActive('/admin/sims') ? 'text-primary-600' : 'text-gray-400'}`} />
              SIM Management
            </Link>
          )}

          <Link 
            to="/dashboard/transactions" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/transactions') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Receipt className={`w-5 h-5 mr-3 ${isActive('/dashboard/transactions') ? 'text-primary-600' : 'text-gray-400'}`} />
            Transactions
          </Link>

          {(userRole === 'reseller' || userRole === 'admin') && (
            <>
              <Link 
                to="/dashboard/api-keys" 
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  isActive('/dashboard/api-keys') 
                    ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Key className={`w-5 h-5 mr-3 ${isActive('/dashboard/api-keys') ? 'text-primary-600' : 'text-gray-400'}`} />
                API Keys
              </Link>
              
              <Link 
                to="/dashboard/affiliate" 
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  isActive('/dashboard/affiliate') 
                    ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Share2 className={`w-5 h-5 mr-3 ${isActive('/dashboard/affiliate') ? 'text-primary-600' : 'text-gray-400'}`} />
                Affiliate
              </Link>
            </>
          )}

          <Link 
            to="/dashboard/beneficiaries" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/beneficiaries') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Users className={`w-5 h-5 mr-3 ${isActive('/dashboard/beneficiaries') ? 'text-primary-600' : 'text-gray-400'}`} />
            Beneficiaries
          </Link>

          <Link 
            to="/dashboard/settings" 
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isActive('/dashboard/settings') 
                ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className={`w-5 h-5 mr-3 ${isActive('/dashboard/settings') ? 'text-primary-600' : 'text-gray-400'}`} />
            Settings
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200 bg-white absolute bottom-0 w-64">
          <Link 
            to="/login" 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
            }}
            className="flex items-center px-4 py-3 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors duration-200"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 ml-64 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
