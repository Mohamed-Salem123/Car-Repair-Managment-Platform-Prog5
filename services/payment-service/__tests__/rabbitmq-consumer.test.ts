/**
 * Unit tests for payment-service RabbitMQ consumer (invoice auto-creation
 * on repair.diagnosed) and producer (payment.completed).
 */

const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue({}),
  assertQueue: jest.fn().mockResolvedValue({ queue: 'payment-service-queue' }),
  bindQueue: jest.fn().mockResolvedValue({}),
  consume: jest.fn(),
  publish: jest.fn(),
  ack: jest.fn(),
  nack: jest.fn(),
};

const mockConnection = { createChannel: jest.fn().mockResolvedValue(mockChannel) };

jest.mock('amqplib', () => ({
  __esModule: true,
  default: { connect: jest.fn().mockResolvedValue(mockConnection) },
  connect: jest.fn().mockResolvedValue(mockConnection),
}));

jest.mock('../src/db', () => ({
  prisma: {
    invoice: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

import { initializeRabbitMQ, publishEvent } from '../src/services/rabbitmq.service';
import { prisma } from '../src/db';

const mockedPrisma = prisma as any as {
  invoice: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
};

let consumeCallback: ((msg: any) => Promise<void>) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockChannel.consume.mockImplementation(async (_queue: string, cb: (msg: any) => Promise<void>) => {
    consumeCallback = cb;
  });
});

describe('payment-service rabbitmq consumer (unit)', () => {
  it('binds payment-service-queue to the repair.diagnosed routing key', async () => {
    await initializeRabbitMQ();

    expect(mockChannel.assertExchange).toHaveBeenCalledWith('garage.events', 'topic', { durable: true });
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('payment-service-queue', { durable: true });
    expect(mockChannel.bindQueue).toHaveBeenCalledWith('payment-service-queue', 'garage.events', 'repair.diagnosed');
    expect(consumeCallback).toBeDefined();
  });

  it('creates a PENDING invoice when a repair.diagnosed event arrives', async () => {
    await initializeRabbitMQ();
    (mockedPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.invoice.create as jest.Mock).mockResolvedValue({ id: 'inv-1' });

    const event = { repairOrderId: 'r1', customerId: 'c1', estimatedCost: 150 };
    await consumeCallback!({
      fields: { routingKey: 'repair.diagnosed' },
      content: Buffer.from(JSON.stringify(event)),
    });

    expect(mockedPrisma.invoice.create).toHaveBeenCalledWith({
      data: {
        repairOrderId: 'r1',
        customerId: 'c1',
        amount: 150,
        currency: 'EUR',
        status: 'PENDING',
      },
    });
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  it('uses amount 0 when estimatedCost is missing', async () => {
    await initializeRabbitMQ();
    (mockedPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.invoice.create as jest.Mock).mockResolvedValue({ id: 'inv-2' });

    await consumeCallback!({
      fields: { routingKey: 'repair.diagnosed' },
      content: Buffer.from(JSON.stringify({ repairOrderId: 'r2', customerId: 'c2' })),
    });

    expect((mockedPrisma.invoice.create as jest.Mock).mock.calls[0][0].data.amount).toBe(0);
  });

  it('is idempotent: skips invoice creation when one already exists', async () => {
    await initializeRabbitMQ();
    (mockedPrisma.invoice.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });

    await consumeCallback!({
      fields: { routingKey: 'repair.diagnosed' },
      content: Buffer.from(JSON.stringify({ repairOrderId: 'r1', customerId: 'c1', estimatedCost: 100 })),
    });

    expect(mockedPrisma.invoice.create).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  it('nacks (no requeue) when invoice creation fails', async () => {
    await initializeRabbitMQ();
    (mockedPrisma.invoice.findFirst as jest.Mock).mockRejectedValue(new Error('db down'));

    await consumeCallback!({
      fields: { routingKey: 'repair.diagnosed' },
      content: Buffer.from(JSON.stringify({ repairOrderId: 'r3', customerId: 'c3' })),
    });

    expect(mockChannel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});

describe('payment-service rabbitmq producer (unit)', () => {
  it('publishes payment.completed to garage.events', async () => {
    await initializeRabbitMQ();
    await publishEvent('payment.completed', { invoiceId: 'i1', repairOrderId: 'r1', customerId: 'c1', amount: 150 });

    const [exchange, routingKey, content] = (mockChannel.publish as jest.Mock).mock.calls[0];
    expect(exchange).toBe('garage.events');
    expect(routingKey).toBe('payment.completed');
    expect(JSON.parse(content.toString())).toEqual({
      invoiceId: 'i1',
      repairOrderId: 'r1',
      customerId: 'c1',
      amount: 150,
    });
  });
});
