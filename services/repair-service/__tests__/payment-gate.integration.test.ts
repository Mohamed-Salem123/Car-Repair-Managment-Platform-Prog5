/**
 * Integration tests for the business rule:
 * an ADMIN cannot mark a repair order COMPLETED unless the customer paid.
 * Full HTTP stack (supertest) with mocked DB, RabbitMQ and payment check.
 */

jest.mock('../src/db', () => ({
  prisma: {
    repairOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../src/services/rabbitmq.service', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/payment-check.service', () => ({
  checkInvoicePaid: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { prisma } from '../src/db';
import { checkInvoicePaid } from '../src/services/payment-check.service';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

const db = prisma as any as {
  repairOrder: { findUnique: jest.Mock; update: jest.Mock };
};
const paymentCheck = checkInvoicePaid as unknown as jest.Mock;

const adminToken = jwt.sign({ userId: 'admin-1', role: 'ADMIN' }, JWT_SECRET);

function repairOrder(status: string) {
  return {
    id: 'r1',
    customerId: 'cust-1',
    vehicleId: 'v1',
    status,
    diagnosis: 'Broken part',
    estimatedCost: 100,
    vehicle: {},
    photos: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PATCH /repairs/:id — payment gate for COMPLETED (integration)', () => {
  it('blocks COMPLETED with 400 PAYMENT_REQUIRED when invoice is unpaid', async () => {
    db.repairOrder.findUnique.mockResolvedValue(repairOrder('READY_FOR_PICKUP'));
    paymentCheck.mockResolvedValue({ paid: false, invoiceExists: true });

    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAYMENT_REQUIRED');
    expect(db.repairOrder.update).not.toHaveBeenCalled();
  });

  it('blocks COMPLETED when no invoice exists yet', async () => {
    db.repairOrder.findUnique.mockResolvedValue(repairOrder('READY_FOR_PICKUP'));
    paymentCheck.mockResolvedValue({ paid: false, invoiceExists: false });

    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAYMENT_REQUIRED');
    expect(db.repairOrder.update).not.toHaveBeenCalled();
  });

  it('allows COMPLETED when the invoice is PAID and publishes repair.completed', async () => {
    db.repairOrder.findUnique.mockResolvedValue(repairOrder('READY_FOR_PICKUP'));
    paymentCheck.mockResolvedValue({ paid: true, invoiceExists: true });
    db.repairOrder.update.mockResolvedValue(repairOrder('COMPLETED'));

    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(200);
    expect(res.body.data.repairOrder.status).toBe('COMPLETED');
    expect(db.repairOrder.update).toHaveBeenCalled();

    const { publishEvent } = require('../src/services/rabbitmq.service');
    expect(publishEvent).toHaveBeenCalledWith('repair.completed', expect.objectContaining({ repairOrderId: 'r1' }));
  });

  it('does not call the payment service for non-COMPLETED transitions', async () => {
    db.repairOrder.findUnique.mockResolvedValue(repairOrder('DIAGNOSED'));
    db.repairOrder.update.mockResolvedValue(repairOrder('APPROVED'));

    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(paymentCheck).not.toHaveBeenCalled();
  });
});
