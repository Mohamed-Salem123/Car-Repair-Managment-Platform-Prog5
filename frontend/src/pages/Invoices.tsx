import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    try {
      const res = await axios.get(`${API_URL}/invoices/customer/${user?.id}`);
      setInvoices(res.data.data.invoices);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      setInvoices([]);
    }
  }

  async function handlePay(invoiceId: string) {
    try {
      await axios.post(`${API_URL}/invoices/${invoiceId}/pay`);
      alert('Payment successful!');
      fetchInvoices();
    } catch (error: any) {
      alert(`Payment failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '2rem 0 1rem' }}>My Invoices</h2>

      {invoices.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>No invoices yet</p>
        </div>
      ) : (
        <div className="card-grid">
          {invoices.map(invoice => (
            <div key={invoice.id} className="card">
              <h3>Invoice #{invoice.id.slice(0, 8)}</h3>
              <p><strong>Amount:</strong> {invoice.amount} {invoice.currency}</p>
              <p><strong>Status:</strong> <span style={{ 
                color: invoice.status === 'PAID' ? '#10b981' : '#f59e0b',
                fontWeight: 'bold'
              }}>{invoice.status}</span></p>
              <p><strong>Date:</strong> {new Date(invoice.createdAt).toLocaleDateString()}</p>
              
              {invoice.status === 'PENDING' && (
                <button 
                  onClick={() => handlePay(invoice.id)}
                  className="btn btn-primary"
                  style={{ marginTop: '1rem' }}
                >
                  Pay Now
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
