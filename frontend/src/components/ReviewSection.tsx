import React, { useEffect, useState } from 'react';
import { Star, Quote, ThumbsUp, ChevronLeft, ChevronRight, MessageSquarePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { FadeIn } from './animations/MotionComponents';

interface Review {
  id: string;
  rating: number;
  comment: string;
  helpfulCount: number;
  createdAt: string;
  user: {
    name: string;
    avatar?: string;
  };
}

export default function ReviewSection() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ rating: 5, comment: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const res = await api.get('/reviews');
      if (res.data.success) {
        setReviews(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch reviews', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % Math.max(1, reviews.length));
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + reviews.length) % Math.max(1, reviews.length));
  };

  const handleHelpful = async (id: string) => {
    try {
      const res = await api.post(`/reviews/${id}/helpful`);
      if (res.data.success) {
        setReviews(prev => prev.map(r => r.id === id ? { ...r, helpfulCount: res.data.helpfulCount } : r));
      }
    } catch (err) {
      console.error('Failed to mark helpful', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    const token = localStorage.getItem('token');
    if (!token) {
      setError(t('reviews.loginRequired'));
      setSubmitting(false);
      return;
    }

    try {
      const res = await api.post('/reviews', formData);
      if (res.data.success) {
        setSuccess(t('reviews.submitPending'));
        setFormData({ rating: 5, comment: '' });
        setTimeout(() => setIsModalOpen(false), 3000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('reviews.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const getFullAvatarUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    
    const apiUrl = (import.meta as any).env.VITE_API_URL;
    if (apiUrl && apiUrl.startsWith('http')) {
        const serverUrl = apiUrl.replace(/\/api$/, '');
        return `${serverUrl}/${path}`;
    }
    
    return `/${path}`;
  };

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{t('reviews.sectionTitle')}</h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              {t('reviews.sectionSubtitle')}
            </p>
          </FadeIn>
        </div>

        {reviews.length > 0 ? (
          <div className="relative max-w-4xl mx-auto">
            <div className="overflow-hidden px-4 py-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.5 }}
                  className="bg-gray-50 rounded-3xl p-8 md:p-12 shadow-sm border border-gray-100 relative"
                >
                  <Quote className="absolute top-8 left-8 w-12 h-12 text-primary-100 -z-0" />
                  
                  <div className="relative z-10">
                    <div className="flex mb-6">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-5 h-5 ${i < reviews[currentIndex].rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                    
                    <p className="text-xl md:text-2xl text-gray-700 italic leading-relaxed mb-8">
                      "{reviews[currentIndex].comment}"
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold overflow-hidden mr-4">
                          {reviews[currentIndex].user.avatar ? (
                            <img src={getFullAvatarUrl(reviews[currentIndex].user.avatar)} alt={reviews[currentIndex].user.name} className="w-full h-full object-cover" />
                          ) : (
                            reviews[currentIndex].user.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{reviews[currentIndex].user.name}</h4>
                          <p className="text-sm text-gray-500">{new Date(reviews[currentIndex].createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleHelpful(reviews[currentIndex].id)}
                        className="flex items-center gap-2 text-gray-500 hover:text-primary-600 transition-colors group"
                      >
                        <ThumbsUp className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">{t('reviews.helpfulCount', { count: reviews[currentIndex].helpfulCount })}</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation Controls */}
            <div className="flex justify-center mt-8 gap-4">
              <button 
                onClick={handlePrev}
                className="p-3 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-primary-50 hover:text-primary-600 transition-all shadow-sm"
                aria-label={t('reviews.previousAria')}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button 
                onClick={handleNext}
                className="p-3 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-primary-50 hover:text-primary-600 transition-all shadow-sm"
                aria-label={t('reviews.nextAria')}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-300">
            <p className="text-gray-500">{t('reviews.firstExperience')}</p>
          </div>
        )}

        <div className="mt-16 text-center">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-500/20"
          >
            <MessageSquarePlus className="w-5 h-5" />
            {t('reviews.writeReview')}
          </button>
        </div>
      </div>

      {/* Review Submission Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
              <h3 className="text-2xl font-bold text-gray-900 mb-6">{t('reviews.shareExperience')}</h3>
              
              {error && <p className="p-3 mb-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{error}</p>}
              {success && <p className="p-3 mb-4 bg-green-50 text-green-600 rounded-xl text-sm border border-green-100">{success}</p>}

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
    </section>
  );
}
