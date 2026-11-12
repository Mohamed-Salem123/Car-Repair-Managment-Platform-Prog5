import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div>
      <nav className="navbar">
        <div className="navbar-content">
          <h1>🚗 Garage Management System</h1>
          <nav>
            {user?.role === 'ADMIN' ? (
              <>
                <Link to="/dashboard">Home</Link>
                <Link to="/admin">Admin Dashboard</Link>
                <Link to="/repairs">All Requests</Link>
                <Link to="/notifications">Notifications</Link>
              </>
            ) : (
              <>
                <Link to="/dashboard">Home</Link>
                <Link to="/vehicles">My Vehicles</Link>
                <Link to="/repairs">Repair Requests</Link>
                <Link to="/invoices">Invoices</Link>
                <Link to="/notifications">Notifications</Link>
                <Link to="/new-repair">New Request</Link>
              </>
            )}
            <button onClick={logout}>Logout</button>
          </nav>
        </div>
      </nav>
      <div className="container">
        <Outlet />
      </div>
    </div>
  );
}
