import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';

const statusLabels: Record<string, string> = {
  SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', DIAGNOSED: 'Diagnosed',
  APPROVED: 'Approved', IN_PROGRESS: 'In Progress', READY_FOR_PICKUP: 'Ready for Pickup', COMPLETED: 'Completed',
};

const nextStatus: Record<string, string> = {
  SUBMITTED: 'UNDER_REVIEW', UNDER_REVIEW: 'DIAGNOSED', DIAGNOSED: 'APPROVED',
  APPROVED: 'IN_PROGRESS', IN_PROGRESS: 'READY_FOR_PICKUP', READY_FOR_PICKUP: 'COMPLETED',
};

export default function AdminDashboard() {
  const [repairs, setRepairs] = useState<any[]>([]);
  const [selectedRepair, setSelectedRepair] = useState<any>(null);
  const [formData, setFormData] = useState({
    diagnosis: '', requiredWork: '', estimatedCost: '', expectedPickupDate: '', status: ''
  });

  useEffect(() => {
    fetchRepairs();
  }, []);

  async function fetchRepairs() {
    const res = await axios.get(`${API_URL}/repairs`);
    setRepairs(res.data.data.repairOrders);
  }

  function selectRepair(repair: any) {
    setSelectedRepair(repair);
    setFormData({
      diagnosis: repair.diagnosis || '',
      requiredWork: repair.requiredWork || '',
      estimatedCost: repair.estimatedCost || '',
      expectedPickupDate: repair.expectedPickupDate || '',
      status: repair.status,
    });
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Only send non-empty fields
      const updateData: any = {};
      if (formData.diagnosis) updateData.diagnosis = formData.diagnosis;
      if (formData.requiredWork) updateData.requiredWork = formData.requiredWork;
      if (formData.estimatedCost) updateData.estimatedCost = formData.estimatedCost;
      if (formData.expectedPickupDate) updateData.expectedPickupDate = formData.expectedPickupDate;
      if (formData.status && formData.status !== selectedRepair.status) updateData.status = formData.status;
      
      console.log('Updating repair with data:', updateData);
      await axios.patch(`${API_URL}/repairs/${selectedRepair.id}`, updateData);
      setSelectedRepair(null);
      setFormData({ diagnosis: '', requiredWork: '', estimatedCost: '', expectedPickupDate: '', status: '' });
      fetchRepairs();
    } catch (error: any) {
      console.error('Update failed:', error.response?.data || error.message);
      alert(`Update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async function updateStatus(repair: any) {
    try {
      const newStatus = nextStatus[repair.status];
      if (!newStatus) return;
      console.log('Updating status from', repair.status, 'to', newStatus);
      await axios.patch(`${API_URL}/repairs/${repair.id}`, { status: newStatus });
      fetchRepairs();
    } catch (error: any) {
      console.error('Status update failed:', error.response?.data || error.message);
      alert(`Status update failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '2rem 0 1rem' }}>Admin Dashboard</h2>

      <div className="card-grid" style={{ marginBottom: '2rem' }}>
        <div className="card">
          <h3>📋 All Requests</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{repairs.length}</p>
        </div>
        <div className="card">
          <h3>⏳ In Progress</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f39c12' }}>
            {repairs.filter(r => !['COMPLETED'].includes(r.status)).length}
          </p>
        </div>
        <div className="card">
          <h3>✅ Completed</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>
            {repairs.filter(r => r.status === 'COMPLETED').length}
          </p>
        </div>
      </div>

      {selectedRepair ? (
        <div className="card">
          <h3>Update Request</h3>
          <button onClick={() => setSelectedRepair(null)} style={{ marginBottom: '1rem' }}>← Back</button>
          <form onSubmit={handleUpdate}>
            <div className="form-group">
              <label>Diagnosis *</label>
              <textarea
                value={formData.diagnosis}
                onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                required
                placeholder="Describe the diagnosis..."
              />
            </div>
            <div className="form-group">
              <label>Required Work *</label>
              <textarea
                value={formData.requiredWork}
                onChange={(e) => setFormData({ ...formData, requiredWork: e.target.value })}
                required
                placeholder="Describe the required work..."
              />
            </div>
            <div className="form-group">
              <label>Estimated Cost (€) *</label>
              <input
                type="number"
                value={formData.estimatedCost}
                onChange={(e) => setFormData({ ...formData, estimatedCost: e.target.value })}
                required
                min="0"
                step="0.01"
              />
            </div>
            <div className="form-group">
              <label>Expected Pickup Date *</label>
              <input
                type="date"
                value={formData.expectedPickupDate}
                onChange={(e) => setFormData({ ...formData, expectedPickupDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-success">Save Updates</button>
          </form>
        </div>
      ) : (
        <div className="card">
          <h3>All Repair Requests</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Vehicle</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Problem</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Cost</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map(repair => (
                <tr key={repair.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.75rem' }}>{repair.vehicle.make} {repair.vehicle.model}</td>
                  <td style={{ padding: '0.75rem' }}>{repair.problemDescription.substring(0, 50)}...</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span className={`status status-${repair.status.toLowerCase()}`}>{statusLabels[repair.status]}</span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>{repair.estimatedCost ? `€${repair.estimatedCost}` : '-'}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <button onClick={() => selectRepair(repair)} className="btn btn-primary" style={{ marginRight: '0.5rem', padding: '0.5rem 1rem' }}>
                      Update
                    </button>
                    {nextStatus[repair.status] && (
                      <button onClick={() => updateStatus(repair)} className="btn btn-success" style={{ padding: '0.5rem 1rem' }}>
                        Next →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
