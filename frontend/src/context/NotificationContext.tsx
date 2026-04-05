import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../services/api';

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
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [pricingVersion, setPricingVersion] = useState(0);

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
      pricingVersion
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
