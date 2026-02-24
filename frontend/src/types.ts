export interface User {
  id: number | string;
  name: string;
  fullName?: string; // Sometimes mapped from name in specific responses
  email: string;
  phone: string;
  role: 'user' | 'admin' | 'reseller';
  balance?: number; // Computed/Associated
  wallet?: {
    balance: number;
  };
  
  // KYC & Profile
  kyc_status?: 'none' | 'pending' | 'verified' | 'rejected';
  kyc_document?: string;
  kyc_submitted_at?: string;
  avatar?: string;
  referral_code?: string;
  referred_by?: string;
  package?: string;
  account_status?: 'active' | 'banned' | 'suspended';

  // Virtual Account (snake_case as per DB model)
  virtual_account_number?: string;
  virtual_account_bank?: string;
  virtual_account_name?: string;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

export interface Transaction {
  id: number | string;
  type: 'credit' | 'debit' | string;
  description: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | string;
  reference?: string;
  source?: string;
  createdAt: string;
  updatedAt?: string;
  // Legacy support if needed, otherwise rely on createdAt
  date?: string; 
}

export interface DashboardStats {
  balance: number;
  totalSpent: number;
  totalFunded: number;
  referrals: number;
  transactions: Transaction[];
}

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  user?: User;
  token?: string;
  [key: string]: any;
}
