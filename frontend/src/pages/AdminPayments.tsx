import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export default function AdminPayments() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    fetchInvoices();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [invoices, statusFilter, searchTerm, dateSort]);

  async function fetchInvoices() {
    try {
      const res = await axios.get(`${API_URL}/invoices`);
      setInvoices(res.data.data.invoices);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    }
  }

  function applyFilters() {
    let filtered = [...invoices];

    // Status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(inv => inv.status === statusFilter);
    }

    // Search filter (by customer ID or invoice ID)
    if (searchTerm) {
      filtered = filtered.filter(inv =>
        inv.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.repairOrderId && inv.repairOrderId.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Date sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateSort === 'desc' ? dateB - dateA : dateA - dateB;
    });

    setFilteredInvoices(filtered);
  }

  async function confirmPayment(invoiceId: string) {
    try {
      await axios.post(`${API_URL}/invoices/${invoiceId}/confirm`);
      alert('Payment confirmed!');
      fetchInvoices();
    } catch (error: any) {
      alert(`Failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return '#f59e0b';
      case 'PROCESSING': return '#3b82f6';
      case 'PAID': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Awaiting Payment';
      case 'PROCESSING': return 'Payment Submitted';
      case 'PAID': return 'Confirmed';
      default: return status;
    }
  };

  return (
    <div>
      <h2 style={{ margin: '2rem 0 1rem' }}>Payment Management</h2>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          
          {/* Status Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Status</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Awaiting Payment</option>
              <option value="PROCESSING">Payment Submitted</option>
              <option value="PAID">Confirmed</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Search</label>
            <input
              type="text"
              placeholder="Customer ID, Invoice ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>

          {/* Date Sort */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Sort by Date</label>
            <select 
              value={dateSort} 
              onChange={(e) => setDateSort(e.target.value as 'desc' | 'asc')}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '14px', color: '#666' }}>
          Showing {filteredInvoices.length} of {invoices.length} invoices
        </div>
      </div>

      {/* Invoices Grid */}
      {filteredInvoices.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>No invoices found</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
          {filteredInvoices.map(invoice => (
            <div key={invoice.id} className="card" style={{
              borderLeft: `6px solid ${getStatusColor(invoice.status)}`
            }}>
              <div>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>Invoice #{invoice.id.slice(0, 8)}</h3>
                <p style={{ margin: '0.25rem 0', fontSize: '14px' }}>
                  <strong>Customer:</strong> {invoice.customerId.slice(0, 8)}
                </p>
                {invoice.repairOrderId && (
                  <p style={{ margin: '0.25rem 0', fontSize: '14px' }}>
                    <strong>Repair:</strong> {invoice.repairOrderId.slice(0, 8)}
                  </p>
                )}
                <p style={{ margin: '0.5rem 0', fontSize: '18px' }}>
                  <strong>Amount:</strong> €{invoice.amount} {invoice.currency}
                </p>
                <p style={{ margin: '0.25rem 0', fontSize: '12px', color: '#666' }}>
                  {new Date(invoice.createdAt).toLocaleDateString()} - {new Date(invoice.createdAt).toLocaleTimeString()}
                </p>
              </div>
              
              <div style={{ marginTop: '1rem' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: 'white',
                  backgroundColor: getStatusColor(invoice.status)
                }}>
                  {getStatusLabel(invoice.status)}
                </span>
                
                {invoice.status === 'PROCESSING' && (
                  <button 
                    onClick={() => confirmPayment(invoice.id)}
                    className="btn btn-primary"
                    style={{ marginLeft: '1rem', padding: '6px 16px', fontSize: '12px' }}
                  >
                    Confirm Payment
                  </button>
                )}
              </div>

              {invoice.status === 'PROCESSING' && (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '10px', 
                  backgroundColor: '#dbeafe', 
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  <strong>Action Required:</strong> Customer submitted payment. Please verify and confirm.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
