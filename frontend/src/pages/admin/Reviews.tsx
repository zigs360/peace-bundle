import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Star, CheckCircle, XCircle, Filter } from 'lucide-react';
import { toast } from 'react-hot-toast';
import DataTable from '../../components/Tables/DataTable';

interface Review {
  id: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  isFeatured: boolean;
  createdAt: string;
  user: {
    name: string;
    email: string;
  };
}

export default function ReviewManagement() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });

  useEffect(() => {
    fetchReviews();
  }, [pagination.page, statusFilter]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reviews/admin', {
        params: {
          page: pagination.page,
          status: statusFilter || undefined
        }
      });
      if (res.data.success) {
        setReviews(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch reviews', err);
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      let rejectionReason = '';
      if (status === 'rejected') {
        rejectionReason = window.prompt('Enter reason for rejection (optional):') || '';
      }

      const res = await api.put(`/reviews/${id}/status`, { status, rejectionReason });
      if (res.data.success) {
        toast.success(`Review ${status} successfully`);
        fetchReviews();
      }
    } catch (err) {
      console.error('Failed to update review status', err);
      toast.error('Failed to update status');
    }
  };

  const handleToggleFeatured = async (id: string, currentFeatured: boolean) => {
    try {
      const res = await api.put(`/reviews/${id}/status`, { isFeatured: !currentFeatured });
      if (res.data.success) {
        toast.success(`Review ${!currentFeatured ? 'featured' : 'unfeatured'} successfully`);
        fetchReviews();
      }
    } catch (err) {
      console.error('Failed to update featured status', err);
      toast.error('Failed to update status');
    }
  };

  const columns = [
    {
      key: 'user',
      header: 'Reviewer',
      render: (_: any, review: Review) => (
        <div>
          <p className="font-bold text-gray-900">{review.user.name}</p>
          <p className="text-xs text-gray-500">{review.user.email}</p>
        </div>
      )
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (_: any, review: Review) => (
        <div className="flex">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
            />
          ))}
        </div>
      )
    },
    {
      key: 'comment',
      header: 'Comment',
      render: (comment: string) => (
        <p className="text-sm text-gray-600 max-w-xs truncate" title={comment}>
          {comment}
        </p>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (status: string) => (
        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
          status === 'approved' ? 'bg-green-100 text-green-700' : 
          status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {status}
        </span>
      )
    },
    {
      key: 'featured',
      header: 'Featured',
      render: (_: any, review: Review) => (
        <button 
          onClick={() => handleToggleFeatured(review.id, review.isFeatured)}
          className={`p-1.5 rounded-lg transition-colors ${
            review.isFeatured ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'
          }`}
          title={review.isFeatured ? 'Unfeature' : 'Feature on homepage'}
        >
          <Star className={`w-4 h-4 ${review.isFeatured ? 'fill-yellow-600' : ''}`} />
        </button>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, review: Review) => (
        <div className="flex justify-end gap-2">
          {review.status !== 'approved' && (
            <button 
              onClick={() => handleStatusUpdate(review.id, 'approved')}
              className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
              title="Approve"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          {review.status !== 'rejected' && (
            <button 
              onClick={() => handleStatusUpdate(review.id, 'rejected')}
              className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="Reject"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Moderation</h1>
          <p className="text-gray-500 text-sm">Approve, reject, or feature customer reviews.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <DataTable
          columns={columns}
          data={reviews}
          isLoading={loading}
        />
        
        {/* Pagination placeholder - Assuming DataTable handles it or we add separate component */}
        {pagination.pages > 1 && (
          <div className="p-4 border-t border-gray-50 flex justify-center gap-2">
            {[...Array(pagination.pages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPagination({ ...pagination, page: i + 1 })}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  pagination.page === i + 1 
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
