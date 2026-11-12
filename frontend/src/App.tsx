import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import NewRepair from './pages/NewRepair';
import Repairs from './pages/Repairs';
import RepairDetails from './pages/RepairDetails';
import AdminDashboard from './pages/AdminDashboard';
import Invoices from './pages/Invoices';
import Notifications from './pages/Notifications';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/dashboard" />;
  
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="vehicles" element={<ProtectedRoute><Vehicles /></ProtectedRoute>} />
            <Route path="new-repair" element={<ProtectedRoute><NewRepair /></ProtectedRoute>} />
            <Route path="repairs" element={<ProtectedRoute><Repairs /></ProtectedRoute>} />
            <Route path="repairs/:id" element={<ProtectedRoute><RepairDetails /></ProtectedRoute>} />
            <Route path="invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
