import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Plus, MessageSquare, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export default function Support() {
  const { t } = useTranslation();
  type Ticket = {
    id: string | number;
    ticket_number: string;
    subject: string;
    status: string;
    priority: string;
    message: string;
    admin_response?: string;
    createdAt: string;
    resolved_at?: string;
  };
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    priority: 'medium'
  });

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await api.get<Ticket[]>('/support');
      setTickets(res.data);
    } catch (error) {
      console.error(error);
      toast.error(t('supportPage.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/support', formData);
      toast.success(t('supportPage.createdSuccess'));
      setShowCreateModal(false);
      setFormData({ subject: '', message: '', priority: 'medium' });
      fetchTickets();
    } catch (error) {
      console.error(error);
      toast.error(t('supportPage.createFailed'));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600';
      case 'critical': return 'text-red-800 font-bold';
      case 'medium': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  const handleWhatsAppRedirect = () => {
    const phoneNumber = '2348035446865';
    const message = encodeURIComponent(t('supportPage.whatsappMessage'));
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    
    try {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('WhatsApp redirect failed:', error);
      window.location.href = whatsappUrl;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open':
      case 'resolved':
      case 'closed':
        return t(`supportPage.${status}`);
      default:
        return status;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low':
      case 'medium':
      case 'high':
      case 'critical':
        return t(`supportPage.${priority}`);
      default:
        return priority;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-primary-50 p-6 rounded-xl border border-primary-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-center md:text-left">
          <div className="bg-primary-100 p-3 rounded-full text-primary-600">
            <MessageSquare className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-primary-900">{t('supportPage.urgentTitle')}</h3>
            <p className="text-primary-700">{t('supportPage.urgentSubtitle')}</p>
          </div>
        </div>
        <button
          onClick={handleWhatsAppRedirect}
          className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center shadow-md transition-all active:scale-95 whitespace-nowrap"
        >
          <span className="mr-2">{t('supportPage.whatsappButton')}</span>
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.483 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.308 1.656zm6.29-4.132c1.524.881 3.12 1.346 4.795 1.347h.005c5.376 0 9.75-4.374 9.752-9.75.001-2.607-1.013-5.059-2.856-6.903-1.843-1.844-4.294-2.858-6.901-2.859-5.374 0-9.748 4.374-9.75 9.75-.001 1.714.448 3.39 1.298 4.888l-1.082 3.95 4.044-1.073zm10.977-7.412c-.29-.144-1.711-.845-1.976-.941-.264-.096-.457-.144-.65.144-.194.288-.748.941-.917 1.134-.169.192-.338.216-.628.072-.29-.144-1.225-.452-2.333-1.441-.862-.77-1.444-1.72-1.613-2.008-.17-.288-.018-.444.127-.587.13-.13.29-.336.435-.505.145-.168.193-.288.29-.481.097-.192.048-.36-.024-.505-.073-.144-.65-1.562-.89-2.14-.236-.557-.474-.482-.65-.491-.169-.008-.362-.01-.555-.01-.193 0-.507.072-.772.36-.266.289-1.013.986-1.013 2.404 0 1.418 1.037 2.79 1.182 2.982.145.192 2.037 3.113 4.936 4.363.689.298 1.228.476 1.649.611.692.22 1.321.19 1.819.116.555-.083 1.711-.699 1.952-1.371.241-.672.241-1.25.169-1.37-.072-.12-.265-.192-.555-.337z"/></svg>
        </button>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('supportPage.pageTitle')}</h1>
          <p className="text-gray-500">{t('supportPage.pageSubtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('supportPage.newTicket')}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">{t('supportPage.loading')}</div>
      ) : tickets.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">{t('supportPage.emptyTitle')}</h3>
          <p className="text-gray-500 mb-4">{t('supportPage.emptySubtitle')}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            {t('supportPage.createFirstTicket')}
          </button>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-200">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-mono text-gray-500">#{ticket.ticket_number}</span>
                    <h3 className="text-lg font-medium text-gray-900">{ticket.subject}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)} capitalize`}>
                      {getStatusLabel(ticket.status)}
                    </span>
                  </div>
                  <span className={`text-sm font-medium ${getPriorityColor(ticket.priority)} capitalize flex items-center`}>
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {getPriorityLabel(ticket.priority)}
                  </span>
                </div>
                
                <p className="text-gray-600 mb-4 line-clamp-2">{ticket.message}</p>
                
                {ticket.admin_response && (
                  <div className="bg-gray-50 p-4 rounded-md mb-4 border-l-4 border-primary-500">
                    <p className="text-sm font-medium text-gray-900 mb-1">{t('supportPage.adminResponse')}</p>
                    <p className="text-gray-700">{ticket.admin_response}</p>
                  </div>
                )}

                <div className="flex items-center text-sm text-gray-500 space-x-4">
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                  {ticket.status === 'resolved' && ticket.resolved_at && (
                    <span className="flex items-center text-green-600">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {t('supportPage.resolvedOn', { date: new Date(ticket.resolved_at).toLocaleDateString() })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('supportPage.modalTitle')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('supportPage.subjectLabel')}</label>
                <input
                  type="text"
                  required
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder={t('supportPage.subjectPlaceholder')}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('supportPage.priorityLabel')}</label>
                <select
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  <option value="low">{t('supportPage.low')}</option>
                  <option value="medium">{t('supportPage.medium')}</option>
                  <option value="high">{t('supportPage.high')}</option>
                  <option value="critical">{t('supportPage.critical')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('supportPage.messageLabel')}</label>
                <textarea
                  required
                  rows={4}
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder={t('supportPage.messagePlaceholder')}
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  {t('supportPage.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {t('supportPage.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
