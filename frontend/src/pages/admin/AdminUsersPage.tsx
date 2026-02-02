import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Users, Search, Edit, Wallet, ShieldBan, ShieldCheck, X, FileCheck, CheckCircle, XCircle, Download, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type User = any;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Form States
  const [editFormData, setEditFormData] = useState({ name: '', email: '', phone: '', role: 'user' });
  const [fundAmount, setFundAmount] = useState('');
  const [kycRejectReason, setKycRejectReason] = useState('');

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

  const handleKycClick = (user: User) => {
    setSelectedUser(user);
    setKycRejectReason('');
    setIsKycModalOpen(true);
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

    try {
      await api.post(`/admin/users/${selectedUser.id}/fund`, { amount: fundAmount });
      toast.success('Wallet funded successfully');
      setIsFundModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Failed to fund wallet', err);
      toast.error('Failed to fund wallet');
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
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                        {(user.fullName || user.name || 'U').charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.fullName || user.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{user.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.email}</div>
                    <div className="text-sm text-gray-500">{user.phone}</div>
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
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                >
                  Fund Wallet
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
    </div>
  );
}