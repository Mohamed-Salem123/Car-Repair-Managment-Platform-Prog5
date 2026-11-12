import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export default function NewRepair() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    vehicleId: '', problemDescription: '', handoverDate: '', handoverTime: ''
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchVehicles();
  }, []);

  async function fetchVehicles() {
    const res = await axios.get(`${API_URL}/vehicles`);
    setVehicles(res.data.data.vehicles);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await axios.post(`${API_URL}/repairs`, formData);
    const repairId = res.data.data.repairOrder.id;

    if (photos.length > 0) {
      const photoData = new FormData();
      photos.forEach(photo => photoData.append('photos', photo));
      await axios.post(`${API_URL}/repairs/${repairId}/photos`, photoData);
    }

    navigate('/repairs');
  }

  return (
    <div className="form-container" style={{ maxWidth: '600px' }}>
      <h2>New Repair Request</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="vehicleId">Vehicle</label>
          <select id="vehicleId" name="vehicleId" value={formData.vehicleId} onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })} required>
            <option value="">Select Vehicle</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.make} {v.model} - {v.plateNumber}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="problemDescription">Problem Description</label>
          <textarea
            id="problemDescription"
            name="problemDescription"
            value={formData.problemDescription}
            onChange={(e) => setFormData({ ...formData, problemDescription: e.target.value })}
            required
            placeholder="Describe the problem in detail..."
          />
        </div>
        <div className="form-group">
          <label htmlFor="handoverDate">Handover Date</label>
          <input
            id="handoverDate"
            name="handoverDate"
            type="date"
            value={formData.handoverDate}
            onChange={(e) => setFormData({ ...formData, handoverDate: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="handoverTime">Handover Time</label>
          <input
            id="handoverTime"
            name="handoverTime"
            type="time"
            value={formData.handoverTime}
            onChange={(e) => setFormData({ ...formData, handoverTime: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="photos">Vehicle Photos (Optional)</label>
          <input
            id="photos"
            name="photos"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setPhotos(Array.from(e.target.files || []))}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-full">Submit Request</button>
      </form>
    </div>
  );
}
