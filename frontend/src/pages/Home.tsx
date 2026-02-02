import { Link } from 'react-router-dom';
import { Wifi, Smartphone, Zap, GraduationCap, ShieldCheck, Clock, CreditCard, ArrowRight, CheckCircle } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
      {/* Navbar */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
               <span className="text-2xl font-bold text-primary-600 flex items-center gap-2">
                 <Wifi className="w-8 h-8" />
                 Peace Bundle
               </span>
            </div>
            {/* Auth Links */}
            <div className="flex items-center space-x-4">
              <Link to="/login" className="text-gray-700 hover:text-primary-600 font-medium transition">Login</Link>
              <Link to="/register" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium shadow-md hover:shadow-lg">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-700 to-primary-900 text-white py-20 lg:py-32 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
            <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
             <div className="inline-block px-4 py-1 rounded-full bg-primary-600 bg-opacity-50 text-primary-100 text-sm font-semibold mb-6 border border-primary-500">
               🚀 Fast, Secure & Reliable VTU Services
             </div>
             <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight leading-tight">
               Seamless Connectivity, <br/>
               <span className="text-secondary-400">Unbeatable Prices</span>
             </h1>
             <p className="text-xl md:text-2xl mb-10 text-primary-100 max-w-3xl mx-auto font-light">
               The smartest way to buy Cheap Data, Airtime, Pay Electricity Bills, and Cable TV subscriptions. Instant delivery, 24/7 support.
             </p>
             <div className="flex flex-col sm:flex-row justify-center gap-4">
               <Link to="/register" className="px-8 py-4 bg-white text-primary-700 rounded-xl font-bold text-lg hover:bg-gray-50 transition shadow-xl flex items-center justify-center gap-2">
                 Create Free Account <ArrowRight className="w-5 h-5" />
               </Link>
               <Link to="/login" className="px-8 py-4 bg-transparent border-2 border-primary-400 text-white rounded-xl font-bold text-lg hover:bg-primary-800 transition flex items-center justify-center">
                 Login
               </Link>
             </div>
             
             <div className="mt-12 flex justify-center gap-8 text-primary-200 text-sm font-medium">
               <div className="flex items-center gap-2">
                 <CheckCircle className="w-5 h-5 text-secondary-400" /> Instant Delivery
               </div>
               <div className="flex items-center gap-2">
                 <CheckCircle className="w-5 h-5 text-secondary-400" /> Secure Payment
               </div>
               <div className="flex items-center gap-2">
                 <CheckCircle className="w-5 h-5 text-secondary-400" /> 24/7 Support
               </div>
             </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our Services</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">We provide a wide range of telecommunication and utility services to keep you connected.</p>
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Service 1 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 group">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Wifi className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Buy Data</h3>
              <p className="text-gray-600">Get affordable data plans for MTN, Airtel, Glo, and 9mobile. Valid for 30 days.</p>
            </div>

            {/* Service 2 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 group">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Smartphone className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Airtime Top-up</h3>
              <p className="text-gray-600">Instant airtime recharge for all networks at discounted rates. VTU & Share and Sell.</p>
            </div>

            {/* Service 3 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 group">
              <div className="w-14 h-14 bg-yellow-100 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7 text-yellow-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Pay Bills</h3>
              <p className="text-gray-600">Pay for your Electricity (Prepaid/Postpaid) and Cable TV (DSTV, GOtv, Startimes).</p>
            </div>

            {/* Service 4 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 group">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <GraduationCap className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Education Pins</h3>
              <p className="text-gray-600">Purchase WAEC, NECO, and NABTEB result checker pins instantly.</p>
            </div>
         </div>
      </div>

      {/* Why Choose Us */}
      <div className="bg-gray-900 text-white py-24">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">Why Choose Peace Bundle?</h2>
                <p className="text-gray-400 text-lg mb-8">
                  We are dedicated to providing the best VTU services in Nigeria. Our platform is built with security and speed in mind.
                </p>
                
                <div className="space-y-6">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary-600 text-white">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg leading-6 font-medium text-white">Secure Transactions</h3>
                      <p className="mt-2 text-base text-gray-400">
                        Your transactions and personal data are protected with industry-standard encryption.
                      </p>
                    </div>
                  </div>

                  <div className="flex">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary-600 text-white">
                        <Clock className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg leading-6 font-medium text-white">Automated Delivery</h3>
                      <p className="mt-2 text-base text-gray-400">
                        Our system is fully automated. You get your value instantly after payment.
                      </p>
                    </div>
                  </div>

                  <div className="flex">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary-600 text-white">
                        <CreditCard className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg leading-6 font-medium text-white">Multiple Payment Options</h3>
                      <p className="mt-2 text-base text-gray-400">
                        Fund your wallet easily via Bank Transfer, Card Payment, or Airtime.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 bg-primary-600 rounded-2xl transform rotate-3 opacity-20"></div>
                <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl relative border border-gray-700">
                   <div className="space-y-4">
                      <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-700 rounded w-full"></div>
                      <div className="h-4 bg-gray-700 rounded w-5/6"></div>
                      <div className="h-32 bg-gray-700 rounded w-full mt-8 flex items-center justify-center text-gray-500">
                        (Dashboard Preview Illustration)
                      </div>
                   </div>
                </div>
              </div>
            </div>
         </div>
      </div>

      {/* CTA Section */}
      <div className="bg-secondary-50 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to get started?</h2>
          <p className="text-xl text-gray-600 mb-8">Join thousands of satisfied users who trust Peace Bundle for their daily recharge.</p>
          <Link to="/register" className="inline-block px-8 py-4 bg-primary-600 text-white rounded-xl font-bold text-lg hover:bg-primary-700 transition shadow-lg">
            Create Free Account
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 pt-12 pb-8">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
               <div className="col-span-1 md:col-span-1">
                  <span className="text-2xl font-bold text-primary-600 flex items-center gap-2 mb-4">
                    <Wifi className="w-6 h-6" />
                    Peace Bundle
                  </span>
                  <p className="text-gray-500 text-sm">
                    Your reliable partner for VTU services. Fast, secure, and affordable.
                  </p>
               </div>
               
               <div>
                 <h4 className="font-bold text-gray-900 mb-4">Quick Links</h4>
                 <ul className="space-y-2 text-sm text-gray-600">
                   <li><Link to="/" className="hover:text-primary-600">Home</Link></li>
                   <li><Link to="/login" className="hover:text-primary-600">Login</Link></li>
                   <li><Link to="/register" className="hover:text-primary-600">Register</Link></li>
                 </ul>
               </div>

               <div>
                 <h4 className="font-bold text-gray-900 mb-4">Services</h4>
                 <ul className="space-y-2 text-sm text-gray-600">
                   <li>Buy Data</li>
                   <li>Airtime Top-up</li>
                   <li>Pay Bills</li>
                   <li>Result Checker</li>
                 </ul>
               </div>

               <div>
                 <h4 className="font-bold text-gray-900 mb-4">Contact Us</h4>
                 <ul className="space-y-2 text-sm text-gray-600">
                   <li>support@peacebundle.com</li>
                   <li>+234 800 123 4567</li>
                 </ul>
               </div>
            </div>
            
            <div className="border-t border-gray-100 pt-8 text-center text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Peace Bundle. All rights reserved.
            </div>
         </div>
      </footer>
    </div>
  );
}
