import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getStoredUser } from '../utils/storage';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'broadcast';
  priority: 'low' | 'medium' | 'high' | 'critical';
  isRead: boolean;
  link?: string;
  createdAt: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  isConnected: boolean;
  pricingVersion: number;
  walletVersion: number;
  walletBalance: number | null;
  walletBalanceUpdatedAt: number;
  treasuryVersion: number;
  treasuryBalance: number | null;
  treasuryBalanceUpdatedAt: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [pricingVersion, setPricingVersion] = useState(0);
  const [walletVersion, setWalletVersion] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletBalanceUpdatedAt, setWalletBalanceUpdatedAt] = useState(0);
  const lastWalletRef = useRef<string | null>(null);
  const [treasuryVersion, setTreasuryVersion] = useState(0);
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);
  const [treasuryBalanceUpdatedAt, setTreasuryBalanceUpdatedAt] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      if (res.data.success) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem('wallet_balance');
    const n = cached ? Number(cached) : NaN;
    if (Number.isFinite(n)) setWalletBalance(n);
    const cachedAt = localStorage.getItem('wallet_balance_updated_at');
    const at = cachedAt ? Number(cachedAt) : NaN;
    if (Number.isFinite(at)) setWalletBalanceUpdatedAt(at);

    const tCached = localStorage.getItem('treasury_balance');
    const tb = tCached ? Number(tCached) : NaN;
    if (Number.isFinite(tb)) setTreasuryBalance(tb);
    const tCachedAt = localStorage.getItem('treasury_balance_updated_at');
    const tat = tCachedAt ? Number(tCachedAt) : NaN;
    if (Number.isFinite(tat)) setTreasuryBalanceUpdatedAt(tat);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetchNotifications();

    const socketUrl = (import.meta as any).env.VITE_SOCKET_URL || window.location.origin;
    const newSocket = io(socketUrl, {
      auth: { token },
      // Remove explicit transport: ['websocket'] to allow fallback to polling, 
      // which is more reliable in production environments behind proxies.
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to notification socket');
    });

    newSocket.on('notification', (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      
      // Show toast
      toast(
        (t) => (
          <div onClick={() => toast.dismiss(t.id)} className="cursor-pointer">
            <p className="font-bold">{notification.title}</p>
            <p className="text-sm">{notification.message}</p>
          </div>
        ),
        {
          duration: 6000,
          position: 'top-right',
          icon: notification.type === 'success' ? '✅' : 
                notification.type === 'error' ? '❌' : 
                notification.type === 'warning' ? '⚠️' : '🔔',
        }
      );
    });

    newSocket.on('pricing_update', () => {
      setPricingVersion((v) => v + 1);
    });

    newSocket.on('wallet_balance_updated', async (payload: any) => {
      try {
        const reference = String(payload?.reference || '');
        if (reference && reference === lastWalletRef.current) return;
        if (reference) lastWalletRef.current = reference;

        const parsedBalance = typeof payload?.balance === 'number' ? payload.balance : Number(payload?.balance);
        if (Number.isFinite(parsedBalance)) {
          setWalletBalance(parsedBalance);
          const now = Date.now();
          setWalletBalanceUpdatedAt(now);
          localStorage.setItem('wallet_balance', String(parsedBalance));
          localStorage.setItem('wallet_balance_updated_at', String(now));
        }
        setWalletVersion((v) => v + 1);

        const amount = typeof payload?.amount === 'number' ? payload.amount : Number(payload?.amount);
        const grossAmount = typeof payload?.grossAmount === 'number' ? payload.grossAmount : Number(payload?.grossAmount);
        const feeAmount = typeof payload?.feeAmount === 'number' ? payload.feeAmount : Number(payload?.feeAmount);
        const netAmount = typeof payload?.netAmount === 'number' ? payload.netAmount : Number(payload?.netAmount);
        const gateway = payload?.gateway;
        if (Number.isFinite(grossAmount) && Number.isFinite(feeAmount) && feeAmount > 0 && Number.isFinite(netAmount)) {
          toast.success(`Received ₦${grossAmount.toLocaleString()} - Fee ₦${feeAmount.toLocaleString()} = Credited ₦${netAmount.toLocaleString()}${gateway ? ` (${String(gateway)})` : ''}`);
        } else if (Number.isFinite(amount)) {
          toast.success(`Wallet funded ₦${Number(amount).toLocaleString()}${gateway ? ` (${String(gateway)})` : ''}`);
        }

        const userId = getStoredUser<any>()?.id || null;
        if (userId) {
          setTimeout(async () => {
            try {
              const res = await api.get(`/transactions/stats/${userId}`);
              const serverBalance = res.data?.balance;
              const serverBalanceNum = typeof serverBalance === 'number' ? serverBalance : Number(serverBalance);
              if (Number.isFinite(serverBalanceNum)) {
                setWalletBalance((prev) => {
                  if (prev !== null && Math.abs(prev - serverBalanceNum) > 0.009) {
                    toast.error('Wallet balance adjusted after verification');
                  }
                  return serverBalanceNum;
                });
                const now = Date.now();
                setWalletBalanceUpdatedAt(now);
                localStorage.setItem('wallet_balance', String(serverBalanceNum));
                localStorage.setItem('wallet_balance_updated_at', String(now));
              }
            } catch (e) {
              void e;
            }
          }, 2500);
        }
      } catch (e) {
        void e;
      }
    });

    newSocket.on('treasury_balance_updated', (payload: any) => {
      try {
        const parsedBalance = typeof payload?.balance === 'number' ? payload.balance : Number(payload?.balance);
        if (Number.isFinite(parsedBalance)) {
          setTreasuryBalance(parsedBalance);
          const now = Date.now();
          setTreasuryBalanceUpdatedAt(now);
          localStorage.setItem('treasury_balance', String(parsedBalance));
          localStorage.setItem('treasury_balance_updated_at', String(now));
        }
        setTreasuryVersion((v) => v + 1);
      } catch (e) {
        void e;
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from notification socket');
    });

    return () => {
      newSocket.close();
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      fetchNotifications,
      markAsRead,
      markAllAsRead,
      isConnected,
      pricingVersion,
      walletVersion,
      walletBalance,
      walletBalanceUpdatedAt,
      treasuryVersion,
      treasuryBalance,
      treasuryBalanceUpdatedAt
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
