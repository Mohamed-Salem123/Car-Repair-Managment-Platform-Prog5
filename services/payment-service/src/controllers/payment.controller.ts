import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../db';
import { publishEvent } from '../services/rabbitmq.service';

export async function createInvoice(req: AuthRequest, res: Response) {
  try {
    const { repairOrderId, customerId, amount, currency = 'EUR' } = req.body;

    const invoice = await prisma.invoice.create({
      data: { repairOrderId, customerId, amount: parseFloat(amount), currency },
    });

    res.status(201).json({ success: true, data: { invoice } });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_FAILED', message: 'Failed to create invoice' },
    });
  }
}

export async function getInvoiceByRepair(req: AuthRequest, res: Response) {
  try {
    const { repairOrderId } = req.params;

    // Internal lookup endpoint used by the repair service to enforce the
    // "no completion before payment" business rule. Admin-only.
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const invoice = await prisma.invoice.findUnique({ where: { repairOrderId } });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    res.json({ success: true, data: { invoice } });
  } catch (error) {
    console.error('Get invoice by repair error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch invoice' },
    });
  }
}

export async function getInvoice(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    if (req.user!.role !== 'ADMIN' && invoice.customerId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    res.json({ success: true, data: { invoice } });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch invoice' },
    });
  }
}

export async function payInvoice(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    if (invoice.customerId !== req.user!.userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    if (invoice.status === 'PAID') {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_PAID', message: 'Invoice already paid' },
      });
    }

    // Simulated payment processing
    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: { status: 'PAID' },
    });

    // Publish event
    await publishEvent('payment.completed', {
      invoiceId: updatedInvoice.id,
      repairOrderId: updatedInvoice.repairOrderId,
      customerId: updatedInvoice.customerId,
      amount: updatedInvoice.amount,
    });

    res.json({ success: true, data: { invoice: updatedInvoice } });
  } catch (error) {
    console.error('Pay invoice error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PAYMENT_FAILED', message: 'Failed to process payment' },
    });
  }
}

export async function getCustomerInvoices(req: AuthRequest, res: Response) {
  try {
    const { customerId } = req.params;

    if (req.user!.role !== 'ADMIN' && customerId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const invoices = await prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { invoices } });
  } catch (error) {
    console.error('Get customer invoices error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch invoices' },
    });
  }
}
