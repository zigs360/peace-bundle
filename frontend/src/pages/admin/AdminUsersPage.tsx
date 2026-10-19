import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Users, Search, Edit, Wallet, MinusCircle, ShieldBan, ShieldCheck, X, FileCheck, CheckCircle, XCircle, Download, FileText, Bell, Loader2, KeyRound, Receipt, ArrowUpRight, ArrowDownLeft, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '../../types';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // User Transactions Modal States
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [selectedUserForTxn, setSelectedUserForTxn] = useState<User | null>(null);
  const [userTransactions, setUserTransactions] = useState<any[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnPage, setTxnPage] = useState(1);
  const [txnTotalPages, setTxnTotalPages] = useState(1);
  const [txnTotalCount, setTxnTotalCount] = useState(0);
  const [txnFilterStatus, setTxnFilterStatus] = useState('all');
  const [txnFilterType, setTxnFilterType] = useState('all');
  const [txnSearchInput, setTxnSearchInput] = useState('');
  const [txnActiveSearch, setTxnActiveSearch] = useState('');
  const [expandedTxnId, setExpandedTxnId] = useState<string | number | null>(null);
  const [isSyncingDeposits, setIsSyncingDeposits] = useState(false);
  
  // Form States
  const [editFormData, setEditFormData] = useState({ name: '', email: '', phone: '', role: 'user' });
  const [fundAmount, setFundAmount] = useState('');
  const [deductAmount, setDeductAmount] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [isSubmittingFund, setIsSubmittingFund] = useState(false);
  const [isSubmittingDeduct, setIsSubmittingDeduct] = useState(false);
  const [kycRejectReason, setKycRejectReason] = useState('');
  const [notificationData, setNotificationData] = useState({ title: '', message: '', type: 'info' });
  const [isSubmittingNotification, setIsSubmittingNotification] = useState(false);

  const handleResetPasswordClick = async (user: User) => {
    if (!window.confirm(`Send password reset email/token link to ${user.email}?`)) return;
    try {
      const res = await api.post(`/admin/users/${user.id}/reset-password`);
      toast.success(res.data?.message || `Password reset link sent to ${user.email}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send password reset link');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data as User[]);
    } catch (err) {
      console.error('Failed to fetch users', err);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditFormData({
      name: user.fullName || user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    });
    setIsEditModalOpen(true);
  };

  const handleFundClick = (user: User) => {
    setSelectedUser(user);
    setFundAmount('');
    setIsFundModalOpen(true);
  };

  const handleDeductClick = (user: User) => {
    setSelectedUser(user);
    setDeductAmount('');
    setDeductReason('');
    setIsDeductModalOpen(true);
  };

  const handleKycClick = (user: User) => {
    setSelectedUser(user);
    setKycRejectReason('');
    setIsKycModalOpen(true);
  };

  const handleNotificationClick = (user: User | null) => {
    setSelectedUser(user);
    setNotificationData({ title: '', message: '', type: 'info' });
    setIsNotificationModalOpen(true);
  };

  const handleBlockClick = async (user: User) => {
    if (!window.confirm(`Are you sure you want to ${user.account_status === 'banned' ? 'unblock' : 'block'} this user?`)) return;
    
    try {
      await api.patch(`/admin/users/${user.id}/block`);
      toast.success(`User ${user.account_status === 'banned' ? 'unblocked' : 'blocked'} successfully`);
      fetchUsers();
    } catch (err) {
      console.error('Failed to toggle block status', err);
      toast.error('Failed to update user status');
    }
  };

  const fetchUserTransactions = async (
    userId: string | number,
    page: number = 1,
    status: string = txnFilterStatus,
    type: string = txnFilterType,
    search: string = txnActiveSearch
  ) => {
    setLoadingTxns(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (status && status !== 'all') params.set('status', status);
      if (type && type !== 'all') params.set('type', type);
      if (search && search.trim()) params.set('search', search.trim());

      const res = await api.get(`/admin/users/${userId}/transactions?${params.toString()}`);
      if (res.data?.success) {
        setUserTransactions(res.data.data?.transactions || []);
        setTxnPage(res.data.data?.page || 1);
        setTxnTotalPages(res.data.data?.totalPages || 1);
        setTxnTotalCount(res.data.data?.total || 0);
        if (res.data.user) {
          setSelectedUserForTxn(prev => ({ ...(prev || {}), ...res.data.user } as User));
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch user transactions', err);
      toast.error(err.response?.data?.message || 'Failed to fetch user transactions');
    } finally {
      setLoadingTxns(false);
    }
  };

  const handleViewTransactions = (user: User) => {
    setSelectedUserForTxn(user);
    setTxnPage(1);
    setTxnFilterStatus('all');
    setTxnFilterType('all');
    setTxnSearchInput('');
    setTxnActiveSearch('');
    setExpandedTxnId(null);
    setIsTxnModalOpen(true);
    fetchUserTransactions(user.id, 1, 'all', 'all', '');
  };

  const handleStatusFilterChange = (status: string) => {
    setTxnFilterStatus(status);
    setTxnPage(1);
    if (selectedUserForTxn) {
      fetchUserTransactions(selectedUserForTxn.id, 1, status, txnFilterType, txnActiveSearch);
    }
  };

  const handleTypeFilterChange = (type: string) => {
    setTxnFilterType(type);
    setTxnPage(1);
    if (selectedUserForTxn) {
      fetchUserTransactions(selectedUserForTxn.id, 1, txnFilterStatus, type, txnActiveSearch);
    }
  };

  const handleTxnSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTxnActiveSearch(txnSearchInput);
    setTxnPage(1);
    if (selectedUserForTxn) {
      fetchUserTransactions(selectedUserForTxn.id, 1, txnFilterStatus, txnFilterType, txnSearchInput);
    }
  };

  const handleTxnPageChange = (newPage: number) => {
    if (newPage < 1 || newPage > txnTotalPages || !selectedUserForTxn) return;
    setTxnPage(newPage);
    fetchUserTransactions(selectedUserForTxn.id, newPage, txnFilterStatus, txnFilterType, txnActiveSearch);
  };

  const handleSyncUserDeposits = async () => {
    if (!selectedUserForTxn) return;
    setIsSyncingDeposits(true);
    try {
      const res = await api.post(`/admin/users/${selectedUserForTxn.id}/sync-deposits`);
      const msg = res.data?.message || 'Virtual account reconciliation completed';
      toast.success(msg);
      // Refresh current user transactions & balances
      await fetchUserTransactions(selectedUserForTxn.id, txnPage, txnFilterStatus, txnFilterType, txnActiveSearch);
      // Refresh general users list
      fetchUsers();
    } catch (err: any) {
      console.error('Failed to sync user deposits', err);
      toast.error(err.response?.data?.message || 'Failed to sync user deposits');
    } finally {
      setIsSyncingDeposits(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await api.put(`/admin/users/${selectedUser.id}`, editFormData);
      toast.success('User updated successfully');
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Failed to update user', err);
      toast.error('Failed to update user');
    }
  };

  const submitFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (isSubmittingFund) return;

    try {
      setIsSubmittingFund(true);
      const idempotencyKey = `ADMIN-FUND-${selectedUser.id}-${Date.now()}`;
      await api.post(`/admin/users/${selectedUser.id}/fund`, { 
        amount: fundAmount 
      }, {
        headers: { 'idempotency-key': idempotencyKey }
      });
      toast.success('Wallet funded successfully');
      setIsFundModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Failed to fund wallet', err);
      toast.error(err.response?.data?.message || 'Failed to fund wallet');
    } finally {
      setIsSubmittingFund(false);
    }
  };

  const submitDeduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (isSubmittingDeduct) return;

    try {
      setIsSubmittingDeduct(true);
      const idempotencyKey = `ADMIN-DEDUCT-${selectedUser.id}-${Date.now()}`;
      await api.post(`/admin/users/${selectedUser.id}/deduct`, { 
        amount: deductAmount,
        reason: deductReason || 'Admin Wallet Deduction'
      }, {
        headers: { 'idempotency-key': idempotencyKey }
      });
      toast.success('Wallet deducted successfully');
      setIsDeductModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Failed to deduct wallet', err);
      toast.error(err.response?.data?.message || 'Failed to deduct wallet');
    } finally {
      setIsSubmittingDeduct(false);
    }
  };

  const submitNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingNotification(true);
    
    try {
      if (selectedUser) {
        // Targeted
        await api.post('/notifications/targeted', {
          userIds: [selectedUser.id],
          ...notificationData
        });
        toast.success(`Notification sent to ${selectedUser.fullName || selectedUser.name}`);
      } else {
        // Broadcast
        await api.post('/notifications/broadcast', notificationData);
        toast.success('Broadcast notification sent to all users');
      }
      setIsNotificationModalOpen(false);
    } catch (err: any) {
      console.error('Failed to send notification', err);
      toast.error(err.response?.data?.message || 'Failed to send notification');
    } finally {
      setIsSubmittingNotification(false);
    }
  };

  const submitKycApprove = async () => {
    if (!selectedUser) return;
    if (!window.confirm('Approve KYC for this user?')) return;

    try {
        await api.put(`/admin/users/${selectedUser.id}/kyc/approve`);
        toast.success('KYC Approved');
        setIsKycModalOpen(false);
        fetchUsers();
    } catch (err) {
        console.error('Failed to approve KYC', err);
        toast.error('Failed to approve KYC');
    }
  };

  const submitKycReject = async () => {
    if (!selectedUser) return;
    if (!kycRejectReason) {
        toast.error('Please provide a reason for rejection');
        return;
    }

    try {
        await api.put(`/admin/users/${selectedUser.id}/kyc/reject`, { reason: kycRejectReason });
        toast.success('KYC Rejected');
        setIsKycModalOpen(false);
        fetchUsers();
    } catch (err) {
        console.error('Failed to reject KYC', err);
        toast.error('Failed to reject KYC');
    }
  };

  const filteredUsers = users.filter(user => 
    (user.fullName && user.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.phone && user.phone.includes(searchTerm))
  );

  if (loading) return <div className="text-center py-10">Loading users...</div>;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden relative">
      <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center">
          <Users className="w-6 h-6 text-primary-600 mr-2" />
          <h2 className="text-xl font-bold text-gray-800">User Management</h2>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => handleNotificationClick(null)}
            className="flex items-center px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-all font-medium border border-primary-200"
          >
            <Bell className="w-4 h-4 mr-2" />
            Broadcast Message
          </button>
          
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Virtual Account</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td 
                    className="px-6 py-4 whitespace-nowrap cursor-pointer group"
                    onClick={() => handleViewTransactions(user)}
                    title="Click to view transaction history"
                  >
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 group-hover:bg-primary-200 flex items-center justify-center text-primary-600 font-bold transition-colors">
                        {(user.fullName || user.name || 'U').charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors flex items-center gap-1.5">
                          {user.fullName || user.name || 'Unknown'}
                          <Receipt className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="text-xs text-gray-500">{user.email} / {user.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.virtual_account_number ? (
                      <div>
                        <div className="text-sm font-bold text-gray-900">{user.virtual_account_number}</div>
                        <div className="text-xs text-gray-500">{user.virtual_account_bank}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not Assigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-green-600">₦{Number(user.balance || user.wallet?.balance || 0).toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.account_status === 'banned' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {user.account_status || 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => handleViewTransactions(user)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3" 
                      title="View Transaction History & Audit"
                    >
                        <Receipt className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleEditClick(user)}
                      className="text-blue-600 hover:text-blue-900 mr-3" 
                      title="Edit User"
                    >
                        <Edit className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleFundClick(user)}
                      className="text-green-600 hover:text-green-900 mr-3" 
                      title="Fund Wallet"
                    >
                        <Wallet className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeductClick(user)}
                      className="text-amber-600 hover:text-amber-900 mr-3" 
                      title="Deduct Wallet"
                    >
                        <MinusCircle className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleNotificationClick(user)}
                      className="text-primary-600 hover:text-primary-900 mr-3" 
                      title="Send Notification"
                    >
                        <Bell className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleResetPasswordClick(user)}
                      className="text-purple-600 hover:text-purple-900 mr-3" 
                      title="Send Password Reset Link"
                    >
                        <KeyRound className="w-5 h-5" />
                    </button>
                    {user.kyc_status === 'pending' && (
                        <button 
                            onClick={() => handleKycClick(user)}
                            className="text-yellow-600 hover:text-yellow-900 mr-3" 
                            title="Review KYC"
                        >
                            <FileCheck className="w-5 h-5" />
                        </button>
                    )}
                    {user.role !== 'admin' && (
                        <button 
                          onClick={() => handleBlockClick(user)}
                          className={`${user.account_status === 'banned' ? 'text-green-600' : 'text-red-600'} hover:opacity-80`} 
                          title={user.account_status === 'banned' ? "Unblock User" : "Block User"}
                        >
                            {user.account_status === 'banned' ? <ShieldCheck className="w-5 h-5" /> : <ShieldBan className="w-5 h-5" />}
                        </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                  No users found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-500">Showing {filteredUsers.length} users</span>
      </div>

      {/* Edit User Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Edit User</h3>
              <button onClick={() => setIsEditModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitEdit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input 
                    type="text" 
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                    placeholder="Al-Amin Aminu"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input 
                    type="email" 
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input 
                    type="text" 
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select 
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({...editFormData, role: e.target.value})}
                  >
                    <option value="user">User</option>
                    <option value="reseller">Reseller</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fund Wallet Modal */}
      {isFundModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Fund Wallet</h3>
              <button onClick={() => setIsFundModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitFund}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                    Funding wallet for <strong>{selectedUser?.name || selectedUser?.fullName}</strong>
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount (₦)</label>
                  <input 
                    type="number" 
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    required
                    min="1"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isSubmittingFund}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-bold transition flex items-center justify-center gap-2"
                >
                  {isSubmittingFund && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmittingFund ? 'Funding...' : 'Fund Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deduct Wallet Modal */}
      {isDeductModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-amber-700">Deduct User Wallet</h3>
              <button onClick={() => setIsDeductModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitDeduct}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                    Deducting wallet for <strong>{selectedUser?.name || selectedUser?.fullName}</strong>
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount to Deduct (₦)</label>
                  <input 
                    type="number" 
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    value={deductAmount}
                    onChange={(e) => setDeductAmount(e.target.value)}
                    required
                    min="1"
                    placeholder="Enter amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Reason</label>
                  <input 
                    type="text" 
                    className="mt-1 block w-full border rounded-md px-3 py-2"
                    value={deductReason}
                    onChange={(e) => setDeductReason(e.target.value)}
                    required
                    placeholder="e.g. Reversing double funding / Admin correction"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isSubmittingDeduct}
                  className="w-full bg-amber-600 text-white py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 font-bold transition flex items-center justify-center gap-2"
                >
                  {isSubmittingDeduct && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmittingDeduct ? 'Deducting...' : 'Deduct Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KYC Review Modal */}
      {isKycModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Review KYC Document</h3>
              <button onClick={() => setIsKycModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-gray-500">User Name</span>
                            <span className="font-semibold">{selectedUser.name || selectedUser.fullName}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500">Email</span>
                            <span className="font-semibold">{selectedUser.email}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500">Phone</span>
                            <span className="font-semibold">{selectedUser.phone}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500">Submitted At</span>
                            <span className="font-semibold">{selectedUser.kyc_submitted_at ? new Date(selectedUser.kyc_submitted_at).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg p-2 bg-gray-100 flex justify-center flex-col items-center">
                    {selectedUser.kyc_document ? (
                        selectedUser.kyc_document.toLowerCase().endsWith('.pdf') ? (
                            <div className="text-center p-4">
                                <FileText className="w-16 h-16 text-gray-500 mx-auto mb-2" />
                                <p className="mb-4 text-gray-600">Document is a PDF</p>
                                <a 
                                    href={`http://localhost:5000/${selectedUser.kyc_document}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    View / Download PDF
                                </a>
                            </div>
                        ) : (
                            <a href={`http://localhost:5000/${selectedUser.kyc_document}`} target="_blank" rel="noopener noreferrer">
                                <img 
                                    src={`http://localhost:5000/${selectedUser.kyc_document}`} 
                                    alt="KYC Document" 
                                    className="max-h-[400px] object-contain cursor-pointer hover:opacity-95"
                                />
                            </a>
                        )
                    ) : (
                        <div className="h-40 flex items-center justify-center text-gray-500">
                            No document found
                        </div>
                    )}
                </div>

                <div className="space-y-4 border-t pt-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason (if rejecting)</label>
                        <textarea
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            placeholder="Enter reason for rejection..."
                            value={kycRejectReason}
                            onChange={(e) => setKycRejectReason(e.target.value)}
                            rows={2}
                        />
                    </div>

                    <div className="flex gap-4">
                        <button 
                            onClick={submitKycReject}
                            className="flex-1 flex items-center justify-center py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50"
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </button>
                        <button 
                            onClick={submitKycApprove}
                            className="flex-1 flex items-center justify-center py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </button>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Notification Modal */}
      <AnimatePresence>
        {isNotificationModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md"
            >
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div className="flex items-center">
                  <Bell className="w-5 h-5 text-primary-600 mr-2" />
                  <h3 className="text-xl font-bold text-gray-800">
                    {selectedUser ? 'Send Notification' : 'Broadcast Message'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsNotificationModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {selectedUser && (
                <div className="mb-6 p-3 bg-primary-50 rounded-lg flex items-center border border-primary-100">
                  <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-sm mr-3">
                    {(selectedUser.fullName || selectedUser.name || 'U').charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{selectedUser.fullName || selectedUser.name}</p>
                    <p className="text-xs text-primary-600">{selectedUser.email}</p>
                  </div>
                </div>
              )}

              <form onSubmit={submitNotification} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Title</label>
                  <input 
                    type="text" 
                    required
                    className="block w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
                    value={notificationData.title}
                    onChange={(e) => setNotificationData({...notificationData, title: e.target.value})}
                    placeholder="e.g., Wallet Funded Successfully"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Message</label>
                  <textarea 
                    required
                    className="block w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none resize-none"
                    rows={4}
                    value={notificationData.message}
                    onChange={(e) => setNotificationData({...notificationData, message: e.target.value})}
                    placeholder="Enter your message here..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['info', 'success', 'warning', 'error'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNotificationData({...notificationData, type: t})}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium capitalize transition-all ${
                          notificationData.type === t 
                            ? 'bg-primary-600 border-primary-600 text-white shadow-md' 
                            : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  <button 
                    type="submit"
                    disabled={isSubmittingNotification}
                    className="w-full bg-primary-600 text-white py-3 rounded-xl font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center"
                  >
                    {isSubmittingNotification ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Bell className="w-5 h-5 mr-2" />
                        {selectedUser ? 'Send Notification' : 'Send Broadcast'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* User Transaction History & Reconciliation Modal */}
        {isTxnModalOpen && selectedUserForTxn && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-lg shadow-inner">
                    {(selectedUserForTxn.fullName || selectedUserForTxn.name || 'U').charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-gray-900">
                        {selectedUserForTxn.fullName || selectedUserForTxn.name || 'User'}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        selectedUserForTxn.account_status === 'banned' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {selectedUserForTxn.account_status || 'Active'}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 capitalize">
                        {selectedUserForTxn.role || 'user'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{selectedUserForTxn.email}</span>
                      <span>•</span>
                      <span>{selectedUserForTxn.phone || 'No phone'}</span>
                    </div>
                  </div>
                </div>

                {/* Balance & Quick Actions */}
                <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
                  <div className="bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-semibold">Wallet Balance</span>
                    <span className="text-sm font-extrabold text-green-600">
                      ₦{Number(selectedUserForTxn.balance ?? selectedUserForTxn.wallet?.balance ?? 0).toLocaleString()}
                    </span>
                  </div>

                  {selectedUserForTxn.virtual_account_number && (
                    <div className="bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm hidden sm:block">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-semibold">Virtual Account</span>
                      <span className="text-xs font-bold text-gray-800 font-mono">
                        {selectedUserForTxn.virtual_account_number} ({selectedUserForTxn.virtual_account_bank || 'Bank'})
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleSyncUserDeposits}
                    disabled={isSyncingDeposits}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200 disabled:opacity-50"
                    title="Directly query SafeHaven / Billstack upstream accounts and auto-credit any missing deposits"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDeposits ? 'animate-spin' : ''}`} />
                    {isSyncingDeposits ? 'Reconciling...' : 'Sync Missing Deposits'}
                  </button>

                  <button 
                    onClick={() => setIsTxnModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Status Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'failed', label: 'Failed' },
                    { id: 'reversed', label: 'Reversed' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleStatusFilterChange(tab.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                        txnFilterStatus === tab.id
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Type Filter & Search Bar */}
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <select
                    value={txnFilterType}
                    onChange={(e) => handleTypeFilterChange(e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">All Types</option>
                    <option value="deposit">Deposit / Credit</option>
                    <option value="data">Data Purchase</option>
                    <option value="airtime">Airtime</option>
                    <option value="cable">Cable TV</option>
                    <option value="electricity">Electricity</option>
                    <option value="transfer">Transfer</option>
                    <option value="refund">Refund</option>
                  </select>

                  <form onSubmit={handleTxnSearchSubmit} className="relative flex-1 sm:w-60">
                    <input
                      type="text"
                      placeholder="Search ref, desc, phone..."
                      value={txnSearchInput}
                      onChange={(e) => setTxnSearchInput(e.target.value)}
                      className="w-full text-xs pl-8 pr-7 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    />
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
                    {txnSearchInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setTxnSearchInput('');
                          setTxnActiveSearch('');
                          if (selectedUserForTxn) {
                            fetchUserTransactions(selectedUserForTxn.id, 1, txnFilterStatus, txnFilterType, '');
                          }
                        }}
                        className="text-gray-400 hover:text-gray-600 absolute right-2 top-2"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </form>

                  <button
                    onClick={() => {
                      if (selectedUserForTxn) {
                        fetchUserTransactions(selectedUserForTxn.id, txnPage, txnFilterStatus, txnFilterType, txnActiveSearch);
                      }
                    }}
                    title="Refresh transactions"
                    className="p-1.5 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingTxns ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Transactions List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
                {loadingTxns ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                    <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
                    <p className="text-sm font-medium">Loading user transaction history...</p>
                  </div>
                ) : userTransactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-center">
                    <Receipt className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="text-sm font-semibold text-gray-700">No transactions found</p>
                    <p className="text-xs text-gray-400 max-w-sm mt-1">
                      {txnActiveSearch || txnFilterStatus !== 'all' || txnFilterType !== 'all'
                        ? 'No transactions match your current filters. Try resetting search or status filters.'
                        : 'This user has not performed any transactions yet.'}
                    </p>
                    <button
                      onClick={handleSyncUserDeposits}
                      disabled={isSyncingDeposits}
                      className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                    >
                      Check for Uncredited Deposits
                    </button>
                  </div>
                ) : (
                  userTransactions.map((tx) => {
                    const isCredit = ['credit', 'deposit', 'refund', 'wallet_funding'].includes(String(tx.type || '').toLowerCase());
                    const isFailed = String(tx.status || '').toLowerCase() === 'failed';
                    const isCompleted = String(tx.status || '').toLowerCase() === 'completed';
                    const isPending = String(tx.status || '').toLowerCase() === 'pending';
                    const isReversed = String(tx.status || '').toLowerCase() === 'reversed';
                    const isExpanded = expandedTxnId === tx.id;

                    return (
                      <div
                        key={tx.id}
                        className={`rounded-xl border transition-all ${
                          isExpanded 
                            ? 'border-primary-300 shadow-md bg-white' 
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        {/* Transaction Row Summary */}
                        <div 
                          onClick={() => setExpandedTxnId(isExpanded ? null : tx.id)}
                          className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {isCredit ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-gray-900 truncate">
                                  {tx.description || `${tx.type?.toUpperCase()} Transaction`}
                                </span>
                                <span className={`px-2 py-0.2 text-[10px] font-semibold rounded-full uppercase ${
                                  isCompleted
                                    ? 'bg-green-100 text-green-800'
                                    : isPending
                                    ? 'bg-amber-100 text-amber-800'
                                    : isFailed
                                    ? 'bg-red-100 text-red-800'
                                    : isReversed
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {tx.status || 'unknown'}
                                </span>
                                {tx.type && (
                                  <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase font-semibold">
                                    {tx.type}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-1 flex-wrap">
                                <span className="font-mono text-gray-600">{tx.reference || 'No ref'}</span>
                                <span>•</span>
                                <span>{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}</span>
                                {tx.recipient_phone && (
                                  <>
                                    <span>•</span>
                                    <span>To: {tx.recipient_phone}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Amount & Balance Delta */}
                          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="text-right">
                              <div className={`text-sm font-extrabold ${isCredit ? 'text-green-600' : 'text-gray-900'}`}>
                                {isCredit ? '+' : '-'}₦{Number(tx.amount || 0).toLocaleString()}
                              </div>
                              <div className="text-[10px] text-gray-400 font-mono">
                                Bal: ₦{Number(tx.balance_before || 0).toLocaleString()} → ₦{Number(tx.balance_after || 0).toLocaleString()}
                              </div>
                            </div>

                            <button className="text-gray-400 hover:text-gray-600 p-1">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Audit Drawer */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/70 rounded-b-xl space-y-3">
                            {/* Failure Reason Alert */}
                            {tx.failure_reason && (
                              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
                                <div className="font-bold flex items-center gap-1.5 mb-1 text-red-900">
                                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                  Transaction Failure / Error Reason:
                                </div>
                                <div className="font-mono text-[11px] whitespace-pre-wrap break-all bg-white/70 p-2 rounded border border-red-100">
                                  {tx.failure_reason}
                                </div>
                              </div>
                            )}

                            {/* Technical Audit Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 block">Gateway / Source</span>
                                <span className="font-semibold text-gray-800 break-all">{tx.gateway || tx.source || 'N/A'}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 block">Provider</span>
                                <span className="font-semibold text-gray-800 break-all">{tx.provider || 'N/A'}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 block">Fee</span>
                                <span className="font-semibold text-gray-800">₦{Number(tx.fee || 0).toLocaleString()}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 block">Transaction ID</span>
                                <span className="font-mono font-semibold text-gray-800">{tx.id}</span>
                              </div>
                            </div>

                            {/* Reference Copy Row */}
                            <div className="flex items-center justify-between gap-2 text-xs bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Reference:</span>
                                <span className="font-mono font-semibold text-gray-700 truncate">{tx.reference || 'N/A'}</span>
                              </div>
                              {tx.reference && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard?.writeText(tx.reference);
                                    toast.success('Reference copied to clipboard');
                                  }}
                                  className="flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-800 px-2 py-1 rounded bg-primary-50 border border-primary-200"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </button>
                              )}
                            </div>

                            {/* Provider Metadata Viewer */}
                            {tx.metadata && Object.keys(tx.metadata).length > 0 && (
                              <details className="text-xs bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm">
                                <summary className="font-bold text-gray-700 cursor-pointer select-none">
                                  Raw Metadata & Upstream Provider Details ({Object.keys(tx.metadata).length} keys)
                                </summary>
                                <pre className="mt-2 text-[11px] font-mono text-gray-800 whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-100 max-h-48 overflow-y-auto">
                                  {JSON.stringify(tx.metadata, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer with Pagination */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-600">
                <div>
                  Showing {userTransactions.length} of {txnTotalCount} transactions (Page {txnPage} of {txnTotalPages})
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTxnPageChange(txnPage - 1)}
                    disabled={txnPage <= 1 || loadingTxns}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="font-semibold text-gray-700">
                    {txnPage} / {txnTotalPages || 1}
                  </span>
                  <button
                    onClick={() => handleTxnPageChange(txnPage + 1)}
                    disabled={txnPage >= txnTotalPages || loadingTxns}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}