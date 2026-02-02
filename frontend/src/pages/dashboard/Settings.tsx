import { useState, useEffect } from 'react';
import { User, Lock, Save, AlertCircle, FileText, Upload } from 'lucide-react';
import api from '../../services/api';

export default function Settings() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    referralCode: ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [kycFile, setKycFile] = useState<File | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycMessage, setKycMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const userData = JSON.parse(userStr);
      setUser(userData);
      setFormData({
        fullName: userData.fullName || '',
        phone: userData.phone || '',
        email: userData.email || '',
        referralCode: userData.referralCode || ''
      });
    }
  }, []);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const formDataObj = new FormData();
      formDataObj.append('fullName', formData.fullName);
      formDataObj.append('phone', formData.phone);
      if (avatar) {
        formDataObj.append('avatar', avatar);
      }

      const res = await api.put('/auth/profile', formDataObj, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
      });
      const data = res.data as any;
      const updatedUser = { ...user, ...data };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (err: any) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Failed to update profile' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
        setMessage({ type: 'error', text: 'Passwords do not match' });
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
        await api.put('/auth/password', {
            currentPassword: passwordData.currentPassword,
            newPassword: passwordData.newPassword
        });
        setMessage({ type: 'success', text: 'Password updated successfully' });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
        setMessage({ 
            type: 'error', 
            text: err.response?.data?.message || 'Failed to update password' 
        });
    } finally {
        setLoading(false);
    }
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycFile) {
        setKycMessage({ type: 'error', text: 'Please select a document' });
        return;
    }

    setKycLoading(true);
    setKycMessage(null);

    try {
        const formData = new FormData();
        formData.append('document', kycFile);

        const res = await api.post('/auth/kyc', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        
        const data = res.data as any;
        
        // Update user state locally to reflect KYC status change
        const updatedUser = { 
            ...user, 
            kyc_status: data.kycStatus,
            kyc_document: data.kycDocument 
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);

        setKycMessage({ type: 'success', text: 'KYC document submitted successfully' });
        setKycFile(null);
    } catch (err: any) {
        setKycMessage({ 
            type: 'error', 
            text: err.response?.data?.message || 'Failed to submit KYC' 
        });
    } finally {
        setKycLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Profile Section */}
      <div className="md:col-span-2 space-y-6">
        <form onSubmit={handleProfileUpdate} className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center mb-6 border-b pb-4">
                <User className="w-6 h-6 text-primary-600 mr-3" />
                <h2 className="text-xl font-bold text-gray-800">Profile Information</h2>
            </div>

            <div className="space-y-4">
                {/* Avatar Upload */}
                <div className="flex items-center space-x-6 mb-4">
                    <div className="shrink-0">
                        <img 
                            className="h-16 w-16 object-cover rounded-full border border-gray-200" 
                            src={avatar ? URL.createObjectURL(avatar) : (user.avatar ? `http://localhost:5000/${user.avatar}` : "https://via.placeholder.com/150")} 
                            alt="Profile" 
                        />
                    </div>
                    <label className="block">
                        <span className="sr-only">Choose profile photo</span>
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={(e) => e.target.files && setAvatar(e.target.files[0])}
                            className="block w-full text-sm text-slate-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-full file:border-0
                            file:text-sm file:font-semibold
                            file:bg-primary-50 file:text-primary-700
                            hover:file:bg-primary-100
                            cursor-pointer
                            "
                        />
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                        <input
                            type="email"
                            value={formData.email}
                            disabled
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 cursor-not-allowed"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                        <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Referral Code</label>
                        <div className="flex">
                            <input
                                type="text"
                                value={formData.referralCode}
                                disabled
                                className="w-full px-4 py-2 rounded-l-lg border border-gray-300 bg-gray-50 text-gray-500 font-mono cursor-not-allowed"
                            />
                            <button 
                                type="button"
                                className="px-4 py-2 bg-gray-100 text-gray-600 font-medium rounded-r-lg hover:bg-gray-200 border border-l-0 border-gray-300 transition"
                                onClick={() => {
                                    navigator.clipboard.writeText(formData.referralCode);
                                    alert('Referral code copied!');
                                }}
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg flex items-start mt-4">
                    <AlertCircle className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
                    <p className="text-sm text-blue-700">
                        Email address cannot be changed directly. Please contact support if you need to update your email.
                    </p>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="flex items-center px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </form>
      </div>

      {/* KYC Section */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center mb-6 border-b pb-4">
                <FileText className="w-6 h-6 text-primary-600 mr-3" />
                <h2 className="text-xl font-bold text-gray-800">KYC Verification</h2>
            </div>

            {kycMessage && (
                <div className={`p-3 mb-4 rounded-md text-sm ${
                    kycMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                    {kycMessage.text}
                </div>
            )}

            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-700 mb-2">
                        <strong>Current Status:</strong> <span className={`font-semibold capitalize ${
                            user.kyc_status === 'verified' ? 'text-green-600' : 
                            user.kyc_status === 'rejected' ? 'text-red-600' : 
                            user.kyc_status === 'pending' ? 'text-yellow-600' : 'text-gray-600'
                        }`}>{user.kyc_status || 'Not Submitted'}</span>
                    </p>
                    {user.kyc_rejection_reason && (
                        <p className="text-sm text-red-600 mt-1">
                            <strong>Reason:</strong> {user.kyc_rejection_reason}
                        </p>
                    )}
                </div>

                {user.kyc_status !== 'verified' && (
                    <form onSubmit={handleKycSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Upload ID Document (NIN, Passport, Drivers License)
                            </label>
                            <div className="flex items-center justify-center w-full">
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <Upload className="w-8 h-8 mb-3 text-gray-400" />
                                        <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                        <p className="text-xs text-gray-500">JPG, PNG, GIF or PDF (MAX. 5MB)</p>
                                    </div>
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*,application/pdf"
                                        onChange={(e) => e.target.files && setKycFile(e.target.files[0])}
                                    />
                                </label>
                            </div>
                            {kycFile && (
                                <p className="text-sm text-gray-600 mt-2">
                                    Selected: {kycFile.name}
                                </p>
                            )}
                        </div>

                        <button 
                            type="submit" 
                            disabled={kycLoading || user.kyc_status === 'pending'}
                            className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                        >
                            {kycLoading ? 'Submitting...' : (user.kyc_status === 'pending' ? 'Pending Review' : 'Submit Document')}
                        </button>
                    </form>
                )}
            </div>
        </div>
      </div>

      {/* Password Section */}
      <div className="space-y-6">
        <form onSubmit={handlePasswordChange} className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center mb-6 border-b pb-4">
                <Lock className="w-6 h-6 text-primary-600 mr-3" />
                <h2 className="text-xl font-bold text-gray-800">Security</h2>
            </div>

            {message && (
                <div className={`p-3 mb-4 rounded-md text-sm ${
                    message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                    {message.text}
                </div>
            )}

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <input
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                    <input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        required
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition mt-4 disabled:opacity-50"
                >
                    {loading ? 'Updating...' : 'Update Password'}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
}
