import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [repairs, setRepairs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();

    // Keep the dashboard live: poll for new notifications/repairs and
    // refresh whenever the tab regains focus.
    const interval = setInterval(fetchData, 15000);
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  async function fetchData() {
    try {
      const [repairsRes, notificationsRes] = await Promise.all([
        axios.get(`${API_URL}/repairs`),
        axios.get(`${API_URL}/notifications`),
      ]);
      setRepairs(repairsRes.data.data.repairOrders);
      setNotifications(notificationsRes.data.data.notifications.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  const pendingRepairs = repairs.filter(r => r.status !== 'COMPLETED');
  const pendingPayments = repairs.filter(r => r.estimatedCost && r.status !== 'COMPLETED');

  return (
    <div>
      <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Welcome, {user?.name}</h2>

      <div className="card-grid">
        <div className="card">
          <h3>📋 Repair Requests</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>
            {pendingRepairs.length}
          </p>
          <p>Active Request(s)</p>
          <Link to="/repairs" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
            View Requests
          </Link>
        </div>

        <div className="card">
          <h3>💰 Pending Payments</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>
            {pendingPayments.length}
          </p>
          <p>Pending Invoice(s)</p>
        </div>

        <div className="card">
          <h3>🔔 Notifications</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>
            {notifications.filter(n => !n.isRead).length}
          </p>
          <p>New Notification(s)</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h3>Recent Notifications</h3>
        {notifications.length === 0 ? (
          <p>No notifications</p>
        ) : (
          <div>
            {notifications.map(notif => (
              <div key={notif.id} style={{
                  padding: '1rem',
                  borderBottom: '1px solid #eee',
                  background: notif.isRead ? 'transparent' : '#f0f8ff',
                }}
              >
                <strong>{notif.title}</strong>
                <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>{notif.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
