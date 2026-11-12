import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';

const statusLabels: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  DIAGNOSED: 'Diagnosed',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In Progress',
  READY_FOR_PICKUP: 'Ready for Pickup',
  COMPLETED: 'Completed',
};

export default function Repairs() {
  const [repairs, setRepairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRepairs();
  }, []);

  async function fetchRepairs() {
    try {
      const res = await axios.get(`${API_URL}/repairs`);
      setRepairs(res.data.data.repairOrders);
    } catch (error) {
      console.error('Failed to fetch repairs:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2rem 0 1rem' }}>
        <h2>Repair Requests</h2>
        <Link to="/new-repair" className="btn btn-primary">
          + New Repair Request
        </Link>
      </div>

      {repairs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>No repair requests yet</p>
          <Link to="/new-repair" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Create Your First Request
          </Link>
        </div>
      ) : (
        <div className="card-grid">
          {repairs.map(repair => (
            <Link key={repair.id} to={`/repairs/${repair.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card">
                <h3>{repair.vehicle.make} {repair.vehicle.model}</h3>
                <p>Plate: {repair.vehicle.plateNumber}</p>
                <p>Problem: {repair.problemDescription.substring(0, 100)}...</p>
                <span className={`status status-${repair.status.toLowerCase()}`}>
                  {statusLabels[repair.status] || repair.status}
                </span>
                {repair.estimatedCost && (
                  <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>
                    Cost: €{repair.estimatedCost}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
