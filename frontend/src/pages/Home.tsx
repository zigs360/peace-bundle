import { Link } from 'react-router-dom';
import { Wifi, Smartphone, Zap, GraduationCap, ShieldCheck, Clock, ArrowRight, CheckCircle, Globe } from 'lucide-react';
import { FadeIn, SlideUp, StaggerContainer, StaggerItem, HoverCard, ScaleIn } from '../components/animations/MotionComponents';
import SeoHead from '../components/seo/SeoHead';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900 overflow-x-hidden">
      <SeoHead 
        title="Cheap Data, Airtime & Bill Payment" 
        description="The smartest way to buy Cheap Data, Airtime, Pay Electricity Bills, and Cable TV subscriptions in Nigeria. Instant delivery, 24/7 support."
      />
      
      {/* Navbar */}
      <nav className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            {/* Logo */}
            <div className="flex items-center">
               <Link to="/" className="text-2xl font-bold text-primary-600 flex items-center gap-3 hover:opacity-90 transition-opacity" aria-label="Peace Bundlle Home">
                 <img src="/logo.png" alt="Peace Bundlle Logo" className="h-10 w-auto" width="40" height="40" />
                 <span className="tracking-tight text-gray-900">Peace<span className="text-primary-600">Bundlle</span></span>
               </Link>
            </div>
            


            {/* Auth Links */}
            <div className="flex items-center space-x-4">
              <Link to="/login" className="text-gray-700 hover:text-primary-600 font-medium transition text-sm px-4 py-2 rounded-lg hover:bg-gray-50">Log in</Link>
              <Link to="/register" className="px-5 py-2.5 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition font-medium shadow-lg hover:shadow-primary-500/30 text-sm flex items-center gap-2 transform active:scale-95">
                Get Started <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-white pt-20 pb-32 overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
           <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-primary-100 rounded-full blur-3xl opacity-30 animate-pulse"></div>
           <div className="absolute top-[20%] -left-[10%] w-[40%] h-[40%] bg-secondary-100 rounded-full blur-3xl opacity-30"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
             <ScaleIn delay={0.1} className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-xs font-bold tracking-wide uppercase mb-8 hover:bg-primary-100 transition-colors cursor-default">
               <span className="w-2 h-2 rounded-full bg-primary-500 mr-2 animate-ping"></span>
               #1 Trusted Telecommunication Platform in Nigeria
             </ScaleIn>
             
             <SlideUp delay={0.2} className="text-5xl md:text-7xl font-extrabold text-gray-900 mb-8 tracking-tight leading-[1.1]">
               <h1>
                 Digital Services, <br className="hidden md:block" />
                 <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">Simplified.</span>
               </h1>
             </SlideUp>
             
             <SlideUp delay={0.3} className="text-xl md:text-2xl mb-12 text-gray-500 max-w-2xl mx-auto font-normal leading-relaxed">
               <p>
                 Experience lightning-fast data delivery, instant airtime top-ups, and seamless bill payments. Built for individuals and businesses who demand reliability.
               </p>
             </SlideUp>
             
             <SlideUp delay={0.4} className="flex flex-col sm:flex-row justify-center gap-5 mb-16">
               <HoverCard>
                 <Link to="/register" className="w-full sm:w-auto px-8 py-4 bg-primary-600 text-white rounded-xl font-bold text-lg hover:bg-primary-700 transition shadow-xl shadow-primary-500/20 flex items-center justify-center gap-2">
                   Create Free Account
                 </Link>
               </HoverCard>
               <HoverCard>
                 <a href="#services" className="w-full sm:w-auto px-8 py-4 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-lg hover:bg-gray-50 hover:border-gray-300 transition flex items-center justify-center">
                   View Services
                 </a>
               </HoverCard>
             </SlideUp>

             {/* Trust Signals */}
             <FadeIn delay={0.6} className="border-t border-gray-100 pt-10 grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="flex flex-col items-center">
                   <span className="text-3xl font-bold text-gray-900">50k+</span>
                   <span className="text-sm text-gray-500">Active Users</span>
                </div>
                <div className="flex flex-col items-center">
                   <span className="text-3xl font-bold text-gray-900">99.9%</span>
                   <span className="text-sm text-gray-500">Uptime</span>
                </div>
                <div className="flex flex-col items-center">
                   <span className="text-3xl font-bold text-gray-900">2s</span>
                   <span className="text-sm text-gray-500">Delivery Speed</span>
                </div>
                <div className="flex flex-col items-center">
                   <span className="text-3xl font-bold text-gray-900">24/7</span>
                   <span className="text-sm text-gray-500">Support</span>
                </div>
             </FadeIn>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section id="services" className="py-24 bg-gray-50 relative">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeIn className="text-center mb-16">
               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything You Need</h2>
               <p className="text-xl text-gray-500 max-w-2xl mx-auto">One platform for all your digital utility needs.</p>
            </FadeIn>
            
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               {/* Service 1 */}
               <StaggerItem className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group cursor-pointer hover:-translate-y-1">
                 <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                   <Wifi className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Buy Data Bundles</h3>
                 <p className="text-gray-500 text-sm leading-relaxed">Cheap data plans for MTN, Airtel, Glo, and 9mobile. Valid for 30 days.</p>
               </StaggerItem>

               {/* Service 2 */}
               <StaggerItem className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group cursor-pointer hover:-translate-y-1">
                 <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-green-600 transition-colors">
                   <Smartphone className="w-6 h-6 text-green-600 group-hover:text-white transition-colors" />
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Airtime Top-up</h3>
                 <p className="text-gray-500 text-sm leading-relaxed">Instant recharge for all networks. Get up to 5% discount on every purchase.</p>
               </StaggerItem>

               {/* Service 3 */}
               <StaggerItem className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group cursor-pointer hover:-translate-y-1">
                 <div className="w-12 h-12 bg-yellow-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-yellow-600 transition-colors">
                   <Zap className="w-6 h-6 text-yellow-600 group-hover:text-white transition-colors" />
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Utility Bills</h3>
                 <p className="text-gray-500 text-sm leading-relaxed">Pay Electricity bills (Prepaid/Postpaid) and Cable TV subscriptions instantly.</p>
               </StaggerItem>

               {/* Service 4 */}
               <StaggerItem className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group cursor-pointer hover:-translate-y-1">
                 <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-purple-600 transition-colors">
                   <GraduationCap className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 mb-2">Exam Pins</h3>
                 <p className="text-gray-500 text-sm leading-relaxed">Instant generation of WAEC, NECO, and NABTEB result checker tokens.</p>
               </StaggerItem>
            </StaggerContainer>
         </div>
      </section>

      {/* Feature/Value Prop Section */}
      <section id="features" className="py-24 bg-white overflow-hidden">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1">
                <SlideUp>
                  <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">Why Industry Leaders Choose Peace Bundlle</h2>
                  <p className="text-gray-500 text-lg mb-8 leading-relaxed">
                    We've re-engineered the VTU experience to be faster, more secure, and incredibly reliable. Our infrastructure scales with your needs.
                  </p>
                  
                  <div className="space-y-8">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary-100 text-primary-600">
                          <ShieldCheck className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="ml-6">
                        <h3 className="text-lg leading-6 font-bold text-gray-900">Bank-Grade Security</h3>
                        <p className="mt-2 text-base text-gray-500">
                          End-to-end encryption for all transactions. Your wallet and personal data are protected by industry-standard security protocols.
                        </p>
                      </div>
                    </div>

                    <div className="flex">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-secondary-100 text-secondary-600">
                          <Clock className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="ml-6">
                        <h3 className="text-lg leading-6 font-bold text-gray-900">Automated Delivery</h3>
                        <p className="mt-2 text-base text-gray-500">
                          No waiting time. Our systems process your request immediately, ensuring you get value within seconds of payment.
                        </p>
                      </div>
                    </div>

                    <div className="flex">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-blue-100 text-blue-600">
                          <Globe className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="ml-6">
                        <h3 className="text-lg leading-6 font-bold text-gray-900">Developer API</h3>
                        <p className="mt-2 text-base text-gray-500">
                          Building your own platform? Integrate our robust API to resell our services with ease.
                        </p>
                      </div>
                    </div>
                  </div>
                </SlideUp>
              </div>
              
              <div className="order-1 lg:order-2 relative">
                <ScaleIn>
                  <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-100 bg-gray-900 aspect-[4/3] group">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 to-secondary-600/20 mix-blend-overlay"></div>
                    {/* Abstract UI representation */}
                    <div className="p-8 h-full flex flex-col justify-center items-center">
                        <div className="w-full max-w-sm bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/10 mb-4 transform group-hover:scale-105 transition-transform duration-500">
                           <div className="flex items-center justify-between mb-4">
                              <div className="h-3 w-20 bg-white/20 rounded"></div>
                              <div className="h-8 w-8 bg-green-500/20 rounded-full flex items-center justify-center">
                                 <CheckCircle className="w-4 h-4 text-green-400" />
                              </div>
                           </div>
                           <div className="h-2 w-full bg-white/10 rounded mb-2"></div>
                           <div className="h-2 w-2/3 bg-white/10 rounded"></div>
                        </div>
                        <div className="w-full max-w-sm bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/5 transform scale-95 opacity-70 group-hover:scale-100 group-hover:opacity-100 transition-all duration-500 delay-100">
                           <div className="flex items-center gap-3">
                              <div className="h-8 w-8 bg-blue-500/20 rounded-full"></div>
                              <div className="flex-1">
                                <div className="h-2 w-20 bg-white/20 rounded mb-1"></div>
                                <div className="h-2 w-10 bg-white/10 rounded"></div>
                              </div>
                           </div>
                        </div>
                    </div>
                  </div>
                  {/* Decorative blobs */}
                  <div className="absolute -z-10 -top-10 -right-10 w-64 h-64 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
                  <div className="absolute -z-10 -bottom-10 -left-10 w-64 h-64 bg-secondary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
                </ScaleIn>
              </div>
            </div>
         </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
            <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
        </div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <SlideUp>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">Ready to streamline your payments?</h2>
            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
              Join thousands of satisfied users who trust Peace Bundlle for their daily connectivity needs.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/register" className="px-8 py-4 bg-primary-600 text-white rounded-xl font-bold text-lg hover:bg-primary-500 transition shadow-lg hover:shadow-primary-500/40">
                Get Started Now
              </Link>
              <Link to="/contact" className="px-8 py-4 bg-transparent border border-gray-700 text-white rounded-xl font-bold text-lg hover:bg-gray-800 transition">
                Contact Sales
              </Link>
            </div>
          </SlideUp>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div className="col-span-1 md:col-span-1">
                 <div className="flex items-center gap-2 mb-4">
                   <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
                   <span className="text-xl font-bold text-gray-900">Peace Bundlle</span>
                 </div>
                 <p className="text-gray-500 text-sm">
                   Your one-stop shop for affordable data, airtime, and utility bills. Fast, secure, and reliable.
                 </p>
              </div>
              <div>
                 <h4 className="font-bold text-gray-900 mb-4">Company</h4>
                 <ul className="space-y-2 text-sm text-gray-500">
                    <li><Link to="/about" className="hover:text-primary-600">About Us</Link></li>
                    <li><Link to="/careers" className="hover:text-primary-600">Careers</Link></li>
                    <li><Link to="/blog" className="hover:text-primary-600">Blog</Link></li>
                 </ul>
              </div>
              <div>
                 <h4 className="font-bold text-gray-900 mb-4">Legal</h4>
                 <ul className="space-y-2 text-sm text-gray-500">
                    <li><Link to="/privacy" className="hover:text-primary-600">Privacy Policy</Link></li>
                    <li><Link to="/terms" className="hover:text-primary-600">Terms of Service</Link></li>
                 </ul>
              </div>
              <div>
                 <h4 className="font-bold text-gray-900 mb-4">Connect</h4>
                 <ul className="space-y-2 text-sm text-gray-500">
                    <li><a href="#" className="hover:text-primary-600">Twitter</a></li>
                    <li><a href="#" className="hover:text-primary-600">Facebook</a></li>
                    <li><a href="#" className="hover:text-primary-600">Instagram</a></li>
                 </ul>
              </div>
           </div>
           <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-400">© {new Date().getFullYear()} Peace Bundlle. All rights reserved.</p>
              <div className="flex gap-4">
                 {/* Payment Icons Placeholder */}
                 <div className="h-6 w-10 bg-gray-100 rounded"></div>
                 <div className="h-6 w-10 bg-gray-100 rounded"></div>
                 <div className="h-6 w-10 bg-gray-100 rounded"></div>
              </div>
           </div>
        </div>
      </footer>
    </div>
  );
}
