import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, MessageSquarePlus, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function ReviewModal() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  useEffect(() => {
    checkReviewStatus();
  }, []);

  const checkReviewStatus = async () => {
    try {
      // Check if user has already reviewed
      const res = await api.get('/reviews/me');
      if (res.data.success && res.data.data.length > 0) {
        setHasReviewed(true);
        return;
      }

      // Check last shown timestamp from localStorage
      const lastShown = localStorage.getItem('review_modal_last_shown');
      const now = new Date().getTime();
      const oneMonth = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

      if (!lastShown || now - parseInt(lastShown) > oneMonth) {
        // Show modal after a short delay for better UX
        setTimeout(() => setIsOpen(true), 5000);
      }
    } catch (err) {
      console.error('Failed to check review status', err);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('review_modal_last_shown', new Date().getTime().toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      toast.error(t('reviews.promptEmpty'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/reviews', { rating, comment });
      if (res.data.success) {
        toast.success(t('reviews.promptSuccess'));
        setHasReviewed(true);
        setIsOpen(false);
        localStorage.setItem('review_modal_last_shown', new Date().getTime().toString());
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('reviews.promptFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (hasReviewed) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal Content */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md relative z-10 overflow-hidden"
          >
            {/* Decorative Background Element */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full -mr-16 -mt-16 z-0" />
            
            <button 
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>

            <div className="relative z-10">
              <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-6">
                <MessageSquarePlus className="w-8 h-8 text-primary-600" />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('reviews.promptTitle')}</h2>
              <p className="text-gray-500 mb-8">{t('reviews.promptSubtitle')}</p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 text-center">{t('reviews.ratingLabel')}</label>
                  <div className="flex justify-center gap-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="transition-transform active:scale-90 hover:scale-110"
                      >
                        <Star 
                          className={`w-10 h-10 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{t('reviews.reviewLabel')}</label>
                  <textarea
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all resize-none bg-gray-50/50"
                    rows={4}
                    placeholder={t('reviews.reviewPlaceholder')}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 disabled:opacity-50 flex items-center justify-center"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {t('reviews.submitting')}
                      </>
                    ) : t('reviews.promptCta')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full py-3 text-sm text-gray-400 font-medium hover:text-gray-600 transition"
                  >
                    {t('reviews.promptDismiss')}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
