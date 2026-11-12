import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

const API_URL = '/api'; // Use relative path for nginx proxy

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchUser() {
    try {
      const response = await axios.get(`${API_URL}/users/me`);
      setUser(response.data.data.user);
      registerAdminNotifications(response.data.data.user);
    } catch (error) {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  }

  // Admins register themselves with the notification service so that
  // system events (new repair requests, payments) reach them too.
  function registerAdminNotifications(user: User) {
    if (user?.role === 'ADMIN') {
      axios.post(`${API_URL}/notifications/admins/register`).catch(() => {
        // best-effort: registration failures should not break login
      });
    }
  }

  async function login(email: string, password: string) {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { token, user } = response.data.data;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
    registerAdminNotifications(user);
  }

  async function register(name: string, email: string, phone: string, password: string) {
    const response = await axios.post(`${API_URL}/auth/register`, { name, email, phone, password });
    const { token, user } = response.data.data;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
    registerAdminNotifications(user);
  }

  function logout() {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export { API_URL };
