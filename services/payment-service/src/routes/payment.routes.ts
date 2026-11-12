import { Router } from 'express';
import { createInvoice, getInvoice, getInvoiceByRepair, payInvoice, getCustomerInvoices } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticate, createInvoice);
// Must be registered before /:id so "repair" is not matched as an invoice id
router.get('/repair/:repairOrderId', authenticate, getInvoiceByRepair);
router.get('/:id', authenticate, getInvoice);
router.post('/:id/pay', authenticate, payInvoice);
router.get('/customer/:customerId', authenticate, getCustomerInvoices);

export default router;
