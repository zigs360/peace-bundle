import { useState, useEffect } from 'react';
import api from '../../../services/api';
import DataTable from '../../../components/Tables/DataTable';
import { ShieldCheck, Search, Filter, Eye, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Pagination from '../../../components/Tables/Pagination';

export default function KycIndex() {
  const [kycs, setKycs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedKycs, setSelectedKycs] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const fetchKycs = async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.get('/admin/users/kyc-requests', {
        params: {
          page,
          search,
          status: statusFilter,
          limit: 10
        }
      });
      const { data, totalPages, currentPage } = res.data;
      setKycs(data);
      setTotalPages(totalPages);
      setCurrentPage(currentPage);
    } catch (err) {
      console.error('Failed to fetch KYCs', err);
      toast.error('Failed to load KYC requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchKycs(1);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search, statusFilter]);

  const handlePageChange = (page: number) => {
    fetchKycs(page);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedKycs(kycs.map(k => k.id));
    } else {
      setSelectedKycs([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedKycs(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    if (selectedKycs.length === 0) return;
    
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('Enter reason for rejection:') || '';
      if (!reason) return;
    } else {
      if (!window.confirm(`Approve ${selectedKycs.length} KYC submissions?`)) return;
    }

    try {
      setBulkActionLoading(true);
      await api.post('/admin/users/kyc/bulk', {
        userIds: selectedKycs,
        action,
        reason
      });
      toast.success(`Successfully ${action === 'approve' ? 'approved' : 'rejected'} ${selectedKycs.length} KYCs`);
      setSelectedKycs([]);
      fetchKycs(currentPage);
    } catch (err) {
      console.error('Bulk action failed', err);
      toast.error('Bulk operation failed');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleReview = (user: any) => {
    setSelectedUser(user);
    setIsReviewModalOpen(true);
    setRejectionReason('');
    setIsRejecting(false);
  };

  const processKyc = async (action: 'approve' | 'reject') => {
    if (!selectedUser) return;
    
    if (action === 'reject' && !rejectionReason) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      setLoading(true);
      if (action === 'approve') {
        await api.put(`/admin/users/${selectedUser.id}/kyc/approve`);
      } else {
        await api.put(`/admin/users/${selectedUser.id}/kyc/reject`, { reason: rejectionReason });
      }
      toast.success(`KYC ${action === 'approve' ? 'Approved' : 'Rejected'}`);
      setIsReviewModalOpen(false);
      fetchKycs(currentPage);
    } catch (err) {
      console.error('Action failed', err);
      toast.error('Failed to process KYC');
    } finally {
      setLoading(false);
    }
  };

  const getFullDocUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = (import.meta as any).env.VITE_API_URL || 'https://www.peacebundlle.com';
    return `${baseUrl}/${path}`;
  };

  const columns = [
    {
      key: 'checkbox',
      header: (
        <input 
          type="checkbox" 
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          onChange={handleSelectAll}
          checked={selectedKycs.length === kycs.length && kycs.length > 0}
        />
      ),
      render: (_: any, row: any) => (
        <input 
          type="checkbox" 
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={selectedKycs.includes(row.id)}
          onChange={() => handleSelectOne(row.id)}
        />
      )
    },
    {
      key: 'name',
      header: 'User',
      render: (value: string, row: any) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">{value}</span>
          <span className="text-xs text-gray-500">{row.email}</span>
        </div>
      )
    },
    {
      key: 'phone',
      header: 'Phone'
    },
    {
      key: 'kyc_status',
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          value === 'verified' ? 'bg-green-100 text-green-800' : 
          value === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
          'bg-red-100 text-red-800'
        }`}>
          {value === 'verified' ? 'Approved' : value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      )
    },
    {
      key: 'kyc_submitted_at',
      header: 'Submitted',
      render: (value: string) => value ? new Date(value).toLocaleDateString() : 'N/A'
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: any) => (
        <button 
          onClick={() => handleReview(row)}
          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-full transition-all"
          title="Review KYC"
        >
          <Eye className="w-4 h-4" />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <ShieldCheck className="w-6 h-6 mr-2 text-primary-600" />
            KYC Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">Review and process user identity verification requests.</p>
        </div>

        <div className="flex items-center gap-2">
          {selectedKycs.length > 0 && (
            <div className="flex items-center gap-2 mr-4 bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm font-medium text-primary-700">{selectedKycs.length} selected</span>
              <button 
                disabled={bulkActionLoading}
                onClick={() => handleBulkAction('approve')}
                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 flex items-center"
              >
                {bulkActionLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                Approve
              </button>
              <button 
                disabled={bulkActionLoading}
                onClick={() => handleBulkAction('reject')}
                className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 flex items-center"
              >
                {bulkActionLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                Reject
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search by name, email or phone..." 
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="text-gray-400 w-4 h-4" />
          <select 
            className="border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500 w-full md:w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="verified">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <DataTable columns={columns} data={kycs} isLoading={loading} />
        {!loading && kycs.length > 0 && (
          <div className="p-4 border-t border-gray-200">
            <Pagination 
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {/* KYC Review Modal */}
      {isReviewModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Review KYC Submission</h3>
                <p className="text-sm text-gray-500">Submitted by {selectedUser.name} on {new Date(selectedUser.kyc_submitted_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setIsReviewModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Side: Document View */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Identity Document</span>
                  <a 
                    href={getFullDocUrl(selectedUser.kyc_document)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline flex items-center"
                  >
                    Open in New Tab
                  </a>
                </div>
                <div className="aspect-[4/3] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden flex items-center justify-center relative group">
                  {selectedUser.kyc_document ? (
                    selectedUser.kyc_document.toLowerCase().endsWith('.pdf') ? (
                      <div className="flex flex-col items-center">
                        <ShieldCheck className="w-12 h-12 text-primary-500 mb-2" />
                        <span className="text-sm text-gray-600">PDF Document</span>
                      </div>
                    ) : (
                      <img 
                        src={getFullDocUrl(selectedUser.kyc_document)} 
                        alt="KYC Document" 
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/placeholder-doc.png';
                        }}
                      />
                    )
                  ) : (
                    <span className="text-sm text-gray-500">No document uploaded</span>
                  )}
                </div>
              </div>

              {/* Right Side: Details & Actions */}
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-xl space-y-4">
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">User Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-500 block">Full Name</span>
                      <span className="text-sm font-medium">{selectedUser.name}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">Email Address</span>
                      <span className="text-sm font-medium">{selectedUser.email}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">Phone Number</span>
                      <span className="text-sm font-medium">{selectedUser.phone}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">BVN (Verified)</span>
                      <span className="text-sm font-medium">{selectedUser.bvn || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">Current Status</span>
                      <span className={`text-xs font-bold uppercase ${
                        selectedUser.kyc_status === 'verified' ? 'text-green-600' : 
                        selectedUser.kyc_status === 'pending' ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {selectedUser.kyc_status}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedUser.kyc_status === 'rejected' && selectedUser.kyc_rejection_reason && (
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                    <span className="text-xs font-bold text-red-700 uppercase block mb-1">Previous Rejection Reason</span>
                    <p className="text-sm text-red-600">{selectedUser.kyc_rejection_reason}</p>
                  </div>
                )}

                <div className="space-y-4">
                  {isRejecting ? (
                    <div className="space-y-3 animate-in slide-in-from-top-2">
                      <label className="block text-sm font-medium text-gray-700">Rejection Reason</label>
                      <textarea 
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                        placeholder="Explain why the KYC was rejected (e.g. document expired, blurry image...)"
                        rows={4}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                      />
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setIsRejecting(false)}
                          className="flex-1 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => processKyc('reject')}
                          className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                        >
                          Confirm Rejection
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setIsRejecting(true)}
                        className="flex-1 flex items-center justify-center py-3 border-2 border-red-600 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-all"
                      >
                        <XCircle className="w-5 h-5 mr-2" />
                        Reject
                      </button>
                      <button 
                        onClick={() => processKyc('approve')}
                        className="flex-1 flex items-center justify-center py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all shadow-md hover:shadow-lg active:scale-95"
                      >
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
