/**
 * Unit tests for the payment-check service (repair-service → payment-service).
 * This is the client used to enforce "no COMPLETED before payment".
 */

const mockAxiosInstance = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: (...args: any[]) => mockAxiosInstance(...args) },
}));

import { checkInvoicePaid } from '../src/services/payment-check.service';

beforeEach(() => {
  mockAxiosInstance.mockReset();
});

describe('checkInvoicePaid (unit)', () => {
  it('returns paid=true when payment service reports a PAID invoice', async () => {
    mockAxiosInstance.mockResolvedValue({
      data: { success: true, data: { invoice: { id: 'i1', status: 'PAID' } } },
    });

    const result = await checkInvoicePaid('r1', 'Bearer admin-token');

    expect(result).toEqual({ paid: true, invoiceExists: true });
    const [url, config] = mockAxiosInstance.mock.calls[0];
    expect(url).toContain('/invoices/repair/r1');
    expect(config.headers.Authorization).toBe('Bearer admin-token');
  });

  it('returns paid=false for a PENDING (unpaid) invoice', async () => {
    mockAxiosInstance.mockResolvedValue({
      data: { success: true, data: { invoice: { id: 'i1', status: 'PENDING' } } },
    });

    const result = await checkInvoicePaid('r1', 'Bearer admin-token');
    expect(result).toEqual({ paid: false, invoiceExists: true });
  });

  it('returns paid=false and invoiceExists=false when no invoice exists (404)', async () => {
    mockAxiosInstance.mockRejectedValue({
      response: { status: 404 },
    });

    const result = await checkInvoicePaid('r1', 'Bearer admin-token');
    expect(result).toEqual({ paid: false, invoiceExists: false });
  });

  it('fails closed (paid=false) when payment service is unreachable', async () => {
    mockAxiosInstance.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await checkInvoicePaid('r1', 'Bearer admin-token');
    expect(result).toEqual({ paid: false, invoiceExists: false });
  });
});
