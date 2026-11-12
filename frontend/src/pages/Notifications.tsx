import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    fetchNotifications();

    // Keep the list live: poll for new notifications and refresh
    // whenever the tab regains focus.
    const interval = setInterval(fetchNotifications, 15000);
    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  async function fetchNotifications() {
    try {
      const res = await axios.get(`${API_URL}/notifications`);
      setNotifications(res.data.data.notifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }

  async function markAsRead(id: string) {
    try {
      await axios.patch(`${API_URL}/notifications/${id}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '2rem 0 1rem' }}>Notifications</h2>

      {notifications.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>No notifications</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {notifications.map(notif => {
            const notifDate = new Date(notif.createdAt);
            const isToday = notifDate.toDateString() === new Date().toDateString();
            const timeStr = notifDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const dateStr = notifDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            return (
              <div 
                key={notif.id} 
                className="card"
                style={{
                  backgroundColor: notif.isRead ? '#fff' : '#f0f9ff',
                  borderLeft: notif.isRead ? '4px solid #e5e7eb' : '4px solid #3b82f6'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{notif.title}</h4>
                    <p style={{ margin: '0 0 0.5rem 0', color: '#6b7280' }}>{notif.message}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#9ca3af' }}>
                      <span>📅 {isToday ? 'Today' : dateStr}</span>
                      <span>•</span>
                      <span>🕐 {timeStr}</span>
                    </div>
                  </div>
                  {!notif.isRead && (
                    <button
                      onClick={() => markAsRead(notif.id)}
                      className="btn"
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
