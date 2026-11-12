import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    make: '', model: '', year: new Date().getFullYear(), plateNumber: '', color: ''
  });

  useEffect(() => {
    fetchVehicles();
  }, []);

  async function fetchVehicles() {
    const res = await axios.get(`${API_URL}/vehicles`);
    setVehicles(res.data.data.vehicles);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await axios.post(`${API_URL}/vehicles`, formData);
    setFormData({ make: '', model: '', year: new Date().getFullYear(), plateNumber: '', color: '' });
    setShowForm(false);
    fetchVehicles();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2rem 0 1rem' }}>
        <h2>My Vehicles</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Vehicle'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3>Add New Vehicle</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="make">Make</label>
              <input id="make" name="make" type="text" value={formData.make} onChange={(e) => setFormData({ ...formData, make: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="model">Model</label>
              <input id="model" name="model" type="text" value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="year">Year</label>
              <input id="year" name="year" type="number" value={formData.year} onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })} required />
            </div>
            <div className="form-group">
              <label htmlFor="plateNumber">Plate Number</label>
              <input id="plateNumber" name="plateNumber" type="text" value={formData.plateNumber} onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="color">Color</label>
              <input id="color" name="color" type="text" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} required />
            </div>
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </div>
      )}

      <div className="card-grid">
        {vehicles.map(vehicle => (
          <div key={vehicle.id} className="card">
            <h3>{vehicle.make} {vehicle.model}</h3>
            <p>Year: {vehicle.year}</p>
            <p>Plate: {vehicle.plateNumber}</p>
            <p>Color: {vehicle.color}</p>
          </div>
        ))}
      </div>

      {vehicles.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>You haven't added any vehicles yet</p>
        </div>
      )}
    </div>
  );
}
