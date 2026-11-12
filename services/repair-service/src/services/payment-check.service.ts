import axios from 'axios';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:8003';

export interface InvoiceCheck {
  paid: boolean;
  invoiceExists: boolean;
}

/**
 * Checks (via REST, not the payment database) whether the invoice for a
 * repair order is PAID. Used to enforce the business rule that a repair
 * order cannot be marked COMPLETED until the customer has paid.
 *
 * Fail-closed: on unreachable payment service or missing invoice, the
 * repair order cannot be completed.
 */
export async function checkInvoicePaid(
  repairOrderId: string,
  adminToken: string
): Promise<InvoiceCheck> {
  try {
    const res = await axios.get(
      `${PAYMENT_SERVICE_URL}/invoices/repair/${repairOrderId}`,
      {
        headers: { Authorization: adminToken.startsWith('Bearer ') ? adminToken : `Bearer ${adminToken}` },
        timeout: 5000,
      }
    );

    const invoice = res.data?.data?.invoice;
    return { paid: invoice?.status === 'PAID', invoiceExists: !!invoice };
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return { paid: false, invoiceExists: false };
    }
    console.error('Payment service check failed (fail-closed):', error?.message || error);
    return { paid: false, invoiceExists: false };
  }
}
