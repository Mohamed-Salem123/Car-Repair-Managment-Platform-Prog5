import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';

const statusLabels: Record<string, string> = {
  SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', DIAGNOSED: 'Diagnosed',
  APPROVED: 'Approved', IN_PROGRESS: 'In Progress', READY_FOR_PICKUP: 'Ready for Pickup', COMPLETED: 'Completed',
};

export default function RepairDetails() {
  const { id } = useParams();
  const [repair, setRepair] = useState<any>(null);
  const [question, setQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRepair();
  }, [id]);

  async function fetchRepair() {
    try {
      const res = await axios.get(`${API_URL}/repairs/${id}`);
      setRepair(res.data.data.repairOrder);
    } catch (error) {
      console.error('Failed to fetch repair:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAIQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    try {
      const res = await axios.post(`${API_URL}/ai/chat`, { repairOrderId: id, question });
      setAiResponse(res.data.data.answer);
    } catch (error) {
      console.error('AI request failed:', error);
      setAiResponse('Sorry, an error occurred while processing your question.');
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (!repair) return <div className="error">Request not found</div>;

  return (
    <div>
      <h2 style={{ margin: '2rem 0 1rem' }}>Repair Request Details</h2>

      <div className="card">
        <h3>Vehicle Information</h3>
        <p><strong>Vehicle:</strong> {repair.vehicle.make} {repair.vehicle.model} ({repair.vehicle.year})</p>
        <p><strong>Plate:</strong> {repair.vehicle.plateNumber}</p>
        <p><strong>Color:</strong> {repair.vehicle.color}</p>
      </div>

      <div className="card">
        <h3>Request Details</h3>
        <p><strong>Status:</strong> <span className={`status status-${repair.status.toLowerCase()}`}>{statusLabels[repair.status]}</span></p>
        <p><strong>Problem Description:</strong> {repair.problemDescription}</p>
        <p><strong>Handover Date:</strong> {repair.handoverDate} - {repair.handoverTime}</p>
        
        {repair.diagnosis && (
          <>
            <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid #eee' }} />
            <p><strong>Diagnosis:</strong> {repair.diagnosis}</p>
          </>
        )}
        {repair.requiredWork && <p><strong>Required Work:</strong> {repair.requiredWork}</p>}
        {repair.estimatedCost && <p><strong>Estimated Cost:</strong> €{repair.estimatedCost}</p>}
        {repair.expectedPickupDate && <p><strong>Expected Pickup Date:</strong> {repair.expectedPickupDate}</p>}
      </div>

      {repair.photos && repair.photos.length > 0 && (
        <div className="card">
          <h3>Photos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
            {repair.photos.map((photo: any) => (
              <img key={photo.id} src={`http://localhost:8002${photo.filePath}`} alt="Vehicle photo" style={{ width: '100%', borderRadius: '4px' }} />
            ))}
          </div>
        </div>
      )}

      {repair.diagnosis && (
        <div className="card" style={{ background: '#f8f9fa' }}>
          <h3>🤖 AI Assistant</h3>
          <p style={{ color: '#666', marginBottom: '1rem' }}>Ask about the diagnosis or required work</p>
          <form onSubmit={handleAIQuestion}>
            <div className="form-group">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Example: What does this diagnosis mean?"
                style={{ marginBottom: '0.5rem' }}
              />
            </div>
            <button type="submit" className="btn btn-primary">Send Question</button>
          </form>
          {aiResponse && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '4px' }}>
              <strong>Answer:</strong>
              <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{aiResponse}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
