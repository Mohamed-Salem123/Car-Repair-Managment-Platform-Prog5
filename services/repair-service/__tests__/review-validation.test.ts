/**
 * Integration tests for mandatory admin review fields:
 * a partial review (some fields filled, others empty) is rejected;
 * status-only transitions and complete reviews pass.
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

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

const db = prisma as any as {
  repairOrder: { findUnique: jest.Mock; update: jest.Mock };
};

const adminToken = jwt.sign({ userId: 'admin-1', role: 'ADMIN' }, JWT_SECRET);

function repairOrder(status: string) {
  return {
    id: 'r1',
    customerId: 'cust-1',
    vehicleId: 'v1',
    status,
    diagnosis: null,
    requiredWork: null,
    estimatedCost: null,
    expectedPickupDate: null,
    vehicle: {},
    photos: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.repairOrder.findUnique.mockResolvedValue(repairOrder('SUBMITTED'));
  db.repairOrder.update.mockResolvedValue(repairOrder('UNDER_REVIEW'));
});

describe('PATCH /repairs/:id — mandatory review fields (integration)', () => {
  it('rejects a partial review with 400 REVIEW_FIELDS_REQUIRED', async () => {
    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ diagnosis: 'Broken thermostat', status: 'UNDER_REVIEW' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REVIEW_FIELDS_REQUIRED');
    expect(res.body.error.message).toContain('requiredWork');
    expect(db.repairOrder.update).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only review fields as missing', async () => {
    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diagnosis: 'Broken thermostat',
        requiredWork: '   ',
        estimatedCost: 100,
        expectedPickupDate: '2026-11-20',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REVIEW_FIELDS_REQUIRED');
    expect(db.repairOrder.update).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric estimated cost', async () => {
    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diagnosis: 'Broken thermostat',
        requiredWork: 'Replace thermostat',
        estimatedCost: 'abc',
        expectedPickupDate: '2026-11-20',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(db.repairOrder.update).not.toHaveBeenCalled();
  });

  it('rejects a negative estimated cost', async () => {
    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diagnosis: 'Broken thermostat',
        requiredWork: 'Replace thermostat',
        estimatedCost: -5,
        expectedPickupDate: '2026-11-20',
      });

    expect(res.status).toBe(400);
    expect(db.repairOrder.update).not.toHaveBeenCalled();
  });

  it('accepts a complete review (all 4 fields present)', async () => {
    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        diagnosis: 'Broken thermostat',
        requiredWork: 'Replace thermostat',
        estimatedCost: 100,
        expectedPickupDate: '2026-11-20',
        status: 'UNDER_REVIEW',
      });

    expect(res.status).toBe(200);
    expect(db.repairOrder.update).toHaveBeenCalled();
  });

  it('allows status-only transitions without review fields', async () => {
    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'UNDER_REVIEW' });

    expect(res.status).toBe(200);
    expect(db.repairOrder.update).toHaveBeenCalled();
  });

  it('allows a no-op update without review fields', async () => {
    const res = await request(app)
      .patch('/repairs/r1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
  });
});
