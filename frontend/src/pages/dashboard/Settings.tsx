import { useState, useEffect } from 'react';
import { User, Lock, Save, AlertCircle, FileText, Upload, Trash2, MailCheck } from 'lucide-react';
import api, { SERVER_ROOT_URL } from '../../services/api';
import { StaggerContainer, StaggerItem } from '../../components/animations/MotionComponents';
import { getStoredUser } from '../../utils/storage';

export default function Settings() {
  type AccountDeletionRequestState = {
    id: string;
    status: 'pending' | 'cancelled' | 'rejected' | 'approved' | 'completed';
    requestedAt?: string;
    graceEndsAt?: string;
    cancelledAt?: string | null;
    rejectedAt?: string | null;
    approvedAt?: string | null;
    completedAt?: string | null;
    requestReason?: string | null;
    adminReviewReason?: string | null;
    executionReason?: string | null;
    canCancel: boolean;
    reviewState: 'grace_period' | 'ready_for_review' | 'closed';
  };

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
  const [bvn, setBvn] = useState(''); // New state for BVN
  const [kycLoading, setKycLoading] = useState(false);
  const [kycMessage, setKycMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [pinStatus, setPinStatus] = useState<{ hasPin: boolean; failedAttemptsRemaining: number; lockedUntil: string | null } | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [recoveryOtpMeta, setRecoveryOtpMeta] = useState<{ expiresAt: string; deliveryChannels: Array<{ channel: string; destination: string }> } | null>(null);
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [createPinData, setCreatePinData] = useState({ password: '', pin: '', confirmPin: '' });
  const [changePinData, setChangePinData] = useState({ currentPin: '', newPin: '', confirmPin: '' });
  const [recoverPinData, setRecoverPinData] = useState({ password: '', otp: '', newPin: '', confirmPin: '' });
  const [accountDeletionState, setAccountDeletionState] = useState<{
    request: AccountDeletionRequestState | null;
    retentionPolicy: string;
    minimumGracePeriodDays: number;
  } | null>(null);
  const [accountDeletionMessage, setAccountDeletionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [accountDeletionLoading, setAccountDeletionLoading] = useState(false);
  const [accountDeletionVerificationMeta, setAccountDeletionVerificationMeta] = useState<{ destination: string; expiresAt: string; resendAvailableAt: string } | null>(null);
  const [accountDeletionForm, setAccountDeletionForm] = useState({
    verificationCode: '',
    reason: '',
    confirmPermanentDeletion: false,
    acknowledgeRetentionPolicy: false,
  });

  useEffect(() => {
    const userData = getStoredUser<any>();
    if (userData) {
      setUser(userData);
      setFormData({
        fullName: userData.fullName || '',
        phone: userData.phone || '',
        email: userData.email || '',
        referralCode: userData.referralCode || ''
      });
    }
    void fetchPinStatus();
    void fetchAccountDeletionStatus();
  }, []);

  const refreshStoredUser = async () => {
    const res = await api.get('/auth/me');
    const userData = res.data as any;
    const userForStorage = { ...userData };
    delete userForStorage.virtual_account_number;
    delete userForStorage.virtual_account_bank;
    delete userForStorage.virtual_account_name;
    localStorage.setItem('user', JSON.stringify(userForStorage));
    setUser(userForStorage);
  };

  const fetchPinStatus = async () => {
    try {
      const res = await api.get('/auth/transaction-pin');
      setPinStatus(res.data?.data || null);
    } catch {
      setPinStatus(null);
    }
  };

  const fetchAccountDeletionStatus = async () => {
    try {
      const res = await api.get('/users/account-deletion');
      setAccountDeletionState({
        request: res.data?.request || null,
        retentionPolicy: String(res.data?.retentionPolicy || ''),
        minimumGracePeriodDays: Number(res.data?.minimumGracePeriodDays || 7),
      });
    } catch {
      setAccountDeletionState({
        request: null,
        retentionPolicy: '',
        minimumGracePeriodDays: 7,
      });
    }
  };

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
    if (!bvn || bvn.length !== 11) {
        setKycMessage({ type: 'error', text: 'Please enter a valid 11-digit BVN' });
        return;
    }
    if (!kycFile) {
        setKycMessage({ type: 'error', text: 'Please select a document' });
        return;
    }

    setKycLoading(true);
    setKycMessage(null);

    try {
        const formData = new FormData();
        formData.append('document', kycFile);
        formData.append('bvn', bvn); // Add BVN to form data

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

  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    setPinMessage(null);
    try {
      await api.post('/auth/transaction-pin', createPinData);
      setPinMessage({ type: 'success', text: 'Transaction PIN created successfully' });
      setCreatePinData({ password: '', pin: '', confirmPin: '' });
      await fetchPinStatus();
      await refreshStoredUser();
    } catch (err: any) {
      setPinMessage({ type: 'error', text: err.response?.data?.message || 'Failed to create transaction PIN' });
    } finally {
      setPinLoading(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    setPinMessage(null);
    try {
      await api.put('/auth/transaction-pin', changePinData);
      setPinMessage({ type: 'success', text: 'Transaction PIN changed successfully' });
      setChangePinData({ currentPin: '', newPin: '', confirmPin: '' });
      await fetchPinStatus();
      await refreshStoredUser();
    } catch (err: any) {
      setPinMessage({ type: 'error', text: err.response?.data?.message || 'Failed to change transaction PIN' });
    } finally {
      setPinLoading(false);
    }
  };

  const handleRecoverPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    setPinMessage(null);
    try {
      await api.post('/auth/transaction-pin/recover', recoverPinData);
      setPinMessage({ type: 'success', text: 'Transaction PIN recovered successfully' });
      setRecoverPinData({ password: '', otp: '', newPin: '', confirmPin: '' });
      setRecoveryOtpMeta(null);
      await fetchPinStatus();
      await refreshStoredUser();
    } catch (err: any) {
      setPinMessage({ type: 'error', text: err.response?.data?.message || 'Failed to recover transaction PIN' });
    } finally {
      setPinLoading(false);
    }
  };

  const handleRequestRecoveryOtp = async () => {
    setOtpRequesting(true);
    setPinMessage(null);
    try {
      const res = await api.post('/auth/transaction-pin/recovery/otp');
      const recoveryMeta = res.data?.data || null;
      setRecoveryOtpMeta(recoveryMeta);
      const channelText = (recoveryMeta?.deliveryChannels || [])
        .map((item: { channel: string; destination: string }) => `${item.channel.toUpperCase()}: ${item.destination}`)
        .join(', ');
      setPinMessage({
        type: 'success',
        text: channelText
          ? `Recovery code sent successfully to ${channelText}`
          : 'Recovery code sent successfully',
      });
    } catch (err: any) {
      setPinMessage({ type: 'error', text: err.response?.data?.message || 'Failed to send recovery OTP' });
    } finally {
      setOtpRequesting(false);
    }
  };

  const handleSendAccountDeletionVerification = async () => {
    setAccountDeletionLoading(true);
    setAccountDeletionMessage(null);
    try {
      const res = await api.post('/users/account-deletion/verification');
      const meta = res.data?.data || null;
      setAccountDeletionVerificationMeta(meta);
      setAccountDeletionMessage({
        type: 'success',
        text: meta?.destination
          ? `Verification code sent to ${meta.destination}`
          : 'Verification code sent successfully',
      });
    } catch (err: any) {
      setAccountDeletionMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to send verification code',
      });
    } finally {
      setAccountDeletionLoading(false);
    }
  };

  const handleSubmitAccountDeletionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountDeletionLoading(true);
    setAccountDeletionMessage(null);
    try {
      await api.post('/users/account-deletion/request', accountDeletionForm);
      setAccountDeletionMessage({
        type: 'success',
        text: 'Account deletion request submitted successfully',
      });
      setAccountDeletionForm({
        verificationCode: '',
        reason: '',
        confirmPermanentDeletion: false,
        acknowledgeRetentionPolicy: false,
      });
      setAccountDeletionVerificationMeta(null);
      await fetchAccountDeletionStatus();
    } catch (err: any) {
      setAccountDeletionMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to submit account deletion request',
      });
    } finally {
      setAccountDeletionLoading(false);
    }
  };

  const handleCancelAccountDeletionRequest = async () => {
    if (!window.confirm('Cancel your account deletion request and keep this account active?')) return;
    setAccountDeletionLoading(true);
    setAccountDeletionMessage(null);
    try {
      await api.post('/users/account-deletion/cancel');
      setAccountDeletionMessage({
        type: 'success',
        text: 'Account deletion request cancelled successfully',
      });
      await fetchAccountDeletionStatus();
    } catch (err: any) {
      setAccountDeletionMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to cancel account deletion request',
      });
    } finally {
      setAccountDeletionLoading(false);
    }
  };

  if (!user) return null;

  return (
    <StaggerContainer className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Profile Section */}
      <StaggerItem className="md:col-span-2 space-y-6">
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
                            src={avatar ? URL.createObjectURL(avatar) : (user.avatar ? `${SERVER_ROOT_URL}/${user.avatar}` : "https://placehold.co/150x150?text=Profile")} 
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
                            placeholder="Al-Amin Aminu"
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
      </StaggerItem>

      {/* KYC Section */}
      <StaggerItem className="space-y-6">
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
                                Bank Verification Number (BVN)
                            </label>
                            <input
                                type="text"
                                maxLength={11}
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                                placeholder="Enter 11-digit BVN"
                                value={bvn}
                                onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
                                required
                            />
                            <p className="text-[10px] text-gray-500 mt-1">
                                Your BVN is required for virtual account generation and will be verified securely.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Upload ID Document (NIN, Passport, Drivers License)
                            </label>
                            <div className="flex items-center justify-center w-full">
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <Upload className="w-8 h-8 mb-3 text-gray-400" />
                                        <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                        <p className="text-xs text-gray-500">JPG or PDF only (MAX. 10MB)</p>
                                    </div>
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/jpeg,application/pdf"
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
      </StaggerItem>

      {/* Password Section */}
      <StaggerItem className="space-y-6">
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

        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div className="flex items-center mb-2 border-b pb-4">
                <Lock className="w-6 h-6 text-primary-600 mr-3" />
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Transaction PIN</h2>
                    <p className="text-sm text-gray-500">Use a 4-digit PIN to approve all financial transactions.</p>
                </div>
            </div>

            {pinMessage && (
                <div className={`p-3 rounded-md text-sm ${pinMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {pinMessage.text}
                </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <div><strong>Status:</strong> {pinStatus?.hasPin ? 'Configured' : 'Not set'}</div>
                <div><strong>Attempts remaining:</strong> {pinStatus?.failedAttemptsRemaining ?? '-'}</div>
                {pinStatus?.lockedUntil && <div><strong>Locked until:</strong> {new Date(pinStatus.lockedUntil).toLocaleString()}</div>}
            </div>

            {!pinStatus?.hasPin ? (
                <form onSubmit={handleCreatePin} className="space-y-4">
                    <input type="password" value={createPinData.password} onChange={(e) => setCreatePinData({ ...createPinData, password: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Account password" required />
                    <input type="password" inputMode="numeric" maxLength={4} value={createPinData.pin} onChange={(e) => setCreatePinData({ ...createPinData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="New 4-digit PIN" required />
                    <input type="password" inputMode="numeric" maxLength={4} value={createPinData.confirmPin} onChange={(e) => setCreatePinData({ ...createPinData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Confirm PIN" required />
                    <button type="submit" disabled={pinLoading} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50">{pinLoading ? 'Saving PIN...' : 'Create Transaction PIN'}</button>
                </form>
            ) : (
                <>
                    <form onSubmit={handleChangePin} className="space-y-4">
                        <h3 className="font-semibold text-gray-800">Change PIN</h3>
                        <input type="password" inputMode="numeric" maxLength={4} value={changePinData.currentPin} onChange={(e) => setChangePinData({ ...changePinData, currentPin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Current PIN" required />
                        <input type="password" inputMode="numeric" maxLength={4} value={changePinData.newPin} onChange={(e) => setChangePinData({ ...changePinData, newPin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="New PIN" required />
                        <input type="password" inputMode="numeric" maxLength={4} value={changePinData.confirmPin} onChange={(e) => setChangePinData({ ...changePinData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Confirm new PIN" required />
                        <button type="submit" disabled={pinLoading} className="w-full py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition disabled:opacity-50">{pinLoading ? 'Updating PIN...' : 'Change Transaction PIN'}</button>
                    </form>

                    <form onSubmit={handleRecoverPin} className="space-y-4 border-t pt-6">
                        <h3 className="font-semibold text-gray-800">Forgot PIN Recovery</h3>
                        <p className="text-xs text-gray-500">Request a one-time recovery code, then confirm your account password and new PIN.</p>
                        <button
                          type="button"
                          onClick={() => void handleRequestRecoveryOtp()}
                          disabled={otpRequesting}
                          className="w-full py-2 border border-primary-200 text-primary-700 rounded-lg hover:bg-primary-50 transition disabled:opacity-50"
                        >
                          {otpRequesting ? 'Sending recovery code...' : 'Send Recovery OTP'}
                        </button>
                        {recoveryOtpMeta && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            Code expires at {new Date(recoveryOtpMeta.expiresAt).toLocaleString()}.
                          </div>
                        )}
                        <input type="password" value={recoverPinData.password} onChange={(e) => setRecoverPinData({ ...recoverPinData, password: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Account password" required />
                        <input type="password" inputMode="numeric" maxLength={6} value={recoverPinData.otp} onChange={(e) => setRecoverPinData({ ...recoverPinData, otp: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="6-digit recovery OTP" required />
                        <input type="password" inputMode="numeric" maxLength={4} value={recoverPinData.newPin} onChange={(e) => setRecoverPinData({ ...recoverPinData, newPin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="New PIN" required />
                        <input type="password" inputMode="numeric" maxLength={4} value={recoverPinData.confirmPin} onChange={(e) => setRecoverPinData({ ...recoverPinData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Confirm new PIN" required />
                        <button type="submit" disabled={pinLoading} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50">{pinLoading ? 'Recovering PIN...' : 'Recover Transaction PIN'}</button>
                    </form>
                </>
            )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md space-y-6 border border-red-100">
            <div className="flex items-center mb-2 border-b pb-4">
                <Trash2 className="w-6 h-6 text-red-600 mr-3" />
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Account Deletion</h2>
                    <p className="text-sm text-gray-500">Request permanent account deletion with email verification and a minimum {accountDeletionState?.minimumGracePeriodDays || 7}-day grace period.</p>
                </div>
            </div>

            {accountDeletionMessage && (
                <div className={`p-3 rounded-md text-sm ${accountDeletionMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {accountDeletionMessage.text}
                </div>
            )}

            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-2">
                <p className="font-semibold">This action is permanent.</p>
                <p>When deletion is executed, your personal account data is removed from active systems and cannot be recovered.</p>
                <p>{accountDeletionState?.retentionPolicy || 'Minimal compliance audit logs may be retained only as irreversible hashes and non-personal action records.'}</p>
            </div>

            {accountDeletionState?.request ? (
                <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
                        <div><strong>Status:</strong> <span className="capitalize">{accountDeletionState.request.status.replace(/_/g, ' ')}</span></div>
                        {accountDeletionState.request.requestedAt && <div><strong>Requested:</strong> {new Date(accountDeletionState.request.requestedAt).toLocaleString()}</div>}
                        {accountDeletionState.request.graceEndsAt && <div><strong>Grace period ends:</strong> {new Date(accountDeletionState.request.graceEndsAt).toLocaleString()}</div>}
                        {accountDeletionState.request.requestReason && <div><strong>Your reason:</strong> {accountDeletionState.request.requestReason}</div>}
                        {accountDeletionState.request.adminReviewReason && <div><strong>Admin review note:</strong> {accountDeletionState.request.adminReviewReason}</div>}
                        {accountDeletionState.request.executionReason && <div><strong>Execution note:</strong> {accountDeletionState.request.executionReason}</div>}
                    </div>

                    {accountDeletionState.request.canCancel ? (
                        <button
                            type="button"
                            onClick={() => void handleCancelAccountDeletionRequest()}
                            disabled={accountDeletionLoading}
                            className="w-full py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                        >
                            {accountDeletionLoading ? 'Cancelling request...' : 'Cancel Deletion Request'}
                        </button>
                    ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            {accountDeletionState.request.reviewState === 'grace_period'
                                ? 'Your deletion request is still within the grace period.'
                                : 'This request can no longer be cancelled from self-service settings.'}
                        </div>
                    )}
                </div>
            ) : (
                <form onSubmit={handleSubmitAccountDeletionRequest} className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                        <p className="font-medium">How this works</p>
                        <ol className="list-decimal pl-5 mt-2 space-y-1">
                            <li>Send a verification code to your email address.</li>
                            <li>Enter the code and confirm that you understand the deletion is irreversible.</li>
                            <li>Your request enters a grace period where you can still cancel it before admin review.</li>
                        </ol>
                    </div>

                    <button
                        type="button"
                        onClick={() => void handleSendAccountDeletionVerification()}
                        disabled={accountDeletionLoading}
                        className="w-full py-2 border border-primary-200 text-primary-700 rounded-lg hover:bg-primary-50 transition disabled:opacity-50 flex items-center justify-center"
                    >
                        <MailCheck className="w-4 h-4 mr-2" />
                        {accountDeletionLoading ? 'Sending Verification Code...' : 'Send Email Verification Code'}
                    </button>

                    {accountDeletionVerificationMeta && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                            Verification code sent to {accountDeletionVerificationMeta.destination}. It expires at {new Date(accountDeletionVerificationMeta.expiresAt).toLocaleString()}.
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Verification Code</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={accountDeletionForm.verificationCode}
                            onChange={(e) => setAccountDeletionForm({ ...accountDeletionForm, verificationCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                            placeholder="Enter 6-digit code"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Deletion (Optional)</label>
                        <textarea
                            value={accountDeletionForm.reason}
                            onChange={(e) => setAccountDeletionForm({ ...accountDeletionForm, reason: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                            placeholder="Tell us why you want to delete this account"
                        />
                    </div>

                    <label className="flex items-start gap-3 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={accountDeletionForm.confirmPermanentDeletion}
                            onChange={(e) => setAccountDeletionForm({ ...accountDeletionForm, confirmPermanentDeletion: e.target.checked })}
                            className="mt-1"
                        />
                        <span>I understand that account deletion is permanent and my account cannot be restored after admin execution.</span>
                    </label>

                    <label className="flex items-start gap-3 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={accountDeletionForm.acknowledgeRetentionPolicy}
                            onChange={(e) => setAccountDeletionForm({ ...accountDeletionForm, acknowledgeRetentionPolicy: e.target.checked })}
                            className="mt-1"
                        />
                        <span>I acknowledge the data retention policy for minimal compliance audit records.</span>
                    </label>

                    <button
                        type="submit"
                        disabled={accountDeletionLoading}
                        className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                        {accountDeletionLoading ? 'Submitting Deletion Request...' : 'Submit Account Deletion Request'}
                    </button>
                </form>
            )}
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
