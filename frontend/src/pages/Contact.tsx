import { useState } from 'react';
import { Mail, Phone, MapPin, Send, MessageSquare } from 'lucide-react';
import { toast } from 'react-hot-toast';
import SeoHead from '../components/seo/SeoHead';
import { FadeIn, SlideUp } from '../components/animations/MotionComponents';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast.success('Message sent successfully! We will get back to you shortly.');
    setFormData({ name: '', email: '', subject: '', message: '' });
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <SeoHead 
        title="Contact Sales - Peace Bundlle" 
        description="Get in touch with our sales team for custom solutions, partnership opportunities, or general inquiries."
      />

      {/* Hero Section */}
      <section className="bg-primary-900 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <SlideUp>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Contact Sales</h1>
            <p className="text-xl text-primary-100 max-w-2xl mx-auto">
              Ready to scale your business with our VTU solutions? We're here to help.
            </p>
          </SlideUp>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* Contact Info */}
            <FadeIn>
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-6">Let's start a conversation</h2>
                  <p className="text-gray-600 text-lg leading-relaxed mb-8">
                    Whether you have questions about our API, need a custom enterprise plan, or just want to say hello, we'd love to hear from you.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary-100 text-primary-600">
                        <Mail className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">Email Us</h3>
                      <p className="mt-1 text-gray-500">
                        <a href="mailto:sales@peacebundle.com" className="hover:text-primary-600 transition">sales@peacebundle.com</a>
                        <br />
                        <a href="mailto:support@peacebundle.com" className="hover:text-primary-600 transition">support@peacebundle.com</a>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-secondary-100 text-secondary-600">
                        <Phone className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">Call Us</h3>
                      <p className="mt-1 text-gray-500">
                        <a href="tel:+2348000000000" className="hover:text-primary-600 transition">+234 80 354 468 65</a>
                        <br />
                        <span className="text-sm">Mon-Fri from 8am to 5pm</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-gray-100 text-gray-600">
                        <MapPin className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">Visit Us</h3>
                      <p className="mt-1 text-gray-500">
                        1 Tashan Magarya,<br />
                        Kumo Township Gate, Gombe,<br />
                        Nigeria
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Live Chat</h3>
                  <p className="text-gray-600 mb-4">
                    Need instant help? Our support team is available 24/7 via live chat inside your dashboard.
                  </p>
                  <a href="/login" className="inline-flex items-center text-primary-600 font-medium hover:text-primary-700">
                    Log in to chat <MessageSquare className="w-4 h-4 ml-2" />
                  </a>
                </div>
              </div>
            </FadeIn>

            {/* Contact Form */}
            <SlideUp delay={0.2}>
              <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Send us a message</h3>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition outline-none"
                        placeholder="Al-Amin"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition outline-none"
                        placeholder="al-amin@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <select
                      name="subject"
                      id="subject"
                      required
                      value={formData.subject}
                      onChange={(e: any) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition outline-none"
                    >
                      <option value="">Select a topic...</option>
                      <option value="Sales Inquiry">Sales Inquiry</option>
                      <option value="Partnership">Partnership Proposal</option>
                      <option value="Technical Support">Technical Support</option>
                      <option value="Billing">Billing Question</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                    <textarea
                      name="message"
                      id="message"
                      rows={4}
                      required
                      value={formData.message}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition outline-none resize-none"
                      placeholder="How can we help you today?"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full flex items-center justify-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition ${
                      isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        Send Message <Send className="ml-2 w-4 h-4" />
                      </span>
                    )}
                  </button>
                </form>
              </div>
            </SlideUp>
          </div>
        </div>
      </section>
    </div>
  );
}
