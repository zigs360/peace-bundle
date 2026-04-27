import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Star, MessageSquarePlus, Clock, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface Review {
  id: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
}

export default function MyReviews() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ rating: 5, comment: '' });

  useEffect(() => {
    fetchMyReviews();
  }, []);

  const fetchMyReviews = async () => {
    try {
      const resMe = await api.get('/reviews/me');
      if (resMe.data.success) {
        setReviews(resMe.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch my reviews', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/reviews', formData);
      if (res.data.success) {
        toast.success(t('reviews.submitSuccess'));
        setFormData({ rating: 5, comment: '' });
        setIsModalOpen(false);
        fetchMyReviews();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('reviews.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusLabel = (status: Review['status']) => {
    switch (status) {
      case 'approved':
        return t('reviews.statusApproved');
      case 'rejected':
        return t('reviews.statusRejected');
      default:
        return t('reviews.statusPending');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('reviews.myReviewsTitle')}</h1>
          <p className="text-gray-500 text-sm">{t('reviews.myReviewsSubtitle')}</p>
        </div>
        {reviews.length === 0 && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-500/20"
          >
            <MessageSquarePlus className="w-4 h-4" />
            {t('reviews.writeReview')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                    review.status === 'approved' ? 'bg-green-100 text-green-700' : 
                    review.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {review.status === 'approved' ? <CheckCircle size={10} /> : 
                     review.status === 'rejected' ? <XCircle size={10} /> : <Clock size={10} />}
                    {getStatusLabel(review.status)}
                  </span>
                </div>
              </div>
              <p className="text-gray-700 mb-4">"{review.comment}"</p>
              <div className="flex justify-between items-center text-xs text-gray-400 italic">
                <span>{t('reviews.submittedOn', { date: new Date(review.createdAt).toLocaleDateString() })}</span>
                {review.status === 'rejected' && review.rejectionReason && (
                  <span className="text-red-500 font-medium">{t('reviews.rejectedReason', { reason: review.rejectionReason })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
          <div className="mb-4 flex justify-center">
            <div className="p-3 bg-gray-50 rounded-full">
              <Star className="w-8 h-8 text-gray-300" />
            </div>
          </div>
          <p className="text-gray-500">{t('reviews.noReviews')}</p>
        </div>
      )}

      {/* Submission Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md relative z-10"
            >
              <h3 className="text-2xl font-bold text-gray-900 mb-6">{t('reviews.rateExperience')}</h3>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3">{t('reviews.ratingLabel')}</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFormData({ ...formData, rating: star })}
                        className="transition-transform active:scale-90"
                      >
                        <Star 
                          className={`w-8 h-8 ${star <= formData.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('reviews.reviewLabel')}</label>
                  <textarea
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all resize-none"
                    rows={4}
                    placeholder={t('reviews.reviewPlaceholder')}
                    value={formData.comment}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition"
                  >
                    {t('reviews.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-2 px-8 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 disabled:opacity-50"
                  >
                    {submitting ? t('reviews.submitting') : t('reviews.submit')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
