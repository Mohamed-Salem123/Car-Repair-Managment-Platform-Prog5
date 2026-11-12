/**
 * Unit tests for notification-service RabbitMQ consumer:
 * verifies queue bindings cover every event the system publishes,
 * and that each routing key creates the correct notification.
 */

const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue({}),
  assertQueue: jest.fn().mockResolvedValue({ queue: 'notification-queue' }),
  bindQueue: jest.fn().mockResolvedValue({}),
  consume: jest.fn(),
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
    notification: { create: jest.fn(), createMany: jest.fn() },
    adminRecipient: { findMany: jest.fn() },
  },
}));

import { initializeConsumer } from '../src/services/rabbitmq.service';
import { prisma } from '../src/db';

const mockedPrisma = prisma as any as {
  notification: { create: jest.Mock; createMany: jest.Mock };
  adminRecipient: { findMany: jest.Mock };
};

let consumeCallback: ((msg: any) => Promise<void>) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockChannel.consume.mockImplementation(async (_queue: string, cb: (msg: any) => Promise<void>) => {
    consumeCallback = cb;
  });
  // default: no admins registered
  mockedPrisma.adminRecipient.findMany.mockResolvedValue([]);
});

describe('notification-service rabbitmq consumer (unit)', () => {
  it('binds notification-queue to repair.* and payment.* patterns', async () => {
    await initializeConsumer();

    expect(mockChannel.assertExchange).toHaveBeenCalledWith('garage.events', 'topic', { durable: true });
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('notification-queue', { durable: true });
    expect(mockChannel.bindQueue).toHaveBeenCalledWith('notification-queue', 'garage.events', 'repair.*');
    expect(mockChannel.bindQueue).toHaveBeenCalledWith('notification-queue', 'garage.events', 'payment.*');
    expect(consumeCallback).toBeDefined();
  });

  it.each([
    ['repair.created', 'Repair Request Received', 'repair'],
    ['repair.diagnosed', 'Vehicle Diagnosed', 'repair'],
    ['repair.started', 'Repair In Progress', 'repair'],
    ['repair.ready', 'Vehicle Ready', 'repair'],
    ['repair.completed', 'Repair Completed', 'repair'],
    ['payment.completed', 'Payment Successful', 'payment'],
  ])('creates a notification for event %s', async (routingKey, expectedTitle, expectedType) => {
    await initializeConsumer();
    (mockedPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'n1' });

    const data = { customerId: 'c1', amount: 42.5 };
    await consumeCallback!({
      fields: { routingKey },
      content: Buffer.from(JSON.stringify(data)),
    });

    expect(mockedPrisma.notification.create).toHaveBeenCalledTimes(1);
    const arg = (mockedPrisma.notification.create as jest.Mock).mock.calls[0][0];
    expect(arg.data.userId).toBe('c1');
    expect(arg.data.title).toBe(expectedTitle);
    expect(arg.data.type).toBe(expectedType);
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  it('formats payment amounts in the message', async () => {
    await initializeConsumer();
    (mockedPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'n2' });

    await consumeCallback!({
      fields: { routingKey: 'payment.completed' },
      content: Buffer.from(JSON.stringify({ customerId: 'c1', amount: 99.9 })),
    });

    const arg = (mockedPrisma.notification.create as jest.Mock).mock.calls[0][0];
    expect(arg.data.message).toContain('€99.9');
  });

  it('acks unknown routing keys without crashing', async () => {
    await initializeConsumer();

    await consumeCallback!({
      fields: { routingKey: 'repair.unknown-event' },
      content: Buffer.from(JSON.stringify({ customerId: 'c1' })),
    });

    expect(mockedPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  it('nacks (no requeue) when notification persistence fails', async () => {
    await initializeConsumer();
    (mockedPrisma.notification.create as jest.Mock).mockRejectedValue(new Error('db down'));

    await consumeCallback!({
      fields: { routingKey: 'repair.created' },
      content: Buffer.from(JSON.stringify({ customerId: 'c1' })),
    });

    expect(mockChannel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('notifies registered admins when a new repair request is created', async () => {
    await initializeConsumer();
    (mockedPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'n1' });
    mockedPrisma.adminRecipient.findMany.mockResolvedValue([{ userId: 'admin-1' }, { userId: 'admin-2' }]);
    (mockedPrisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    await consumeCallback!({
      fields: { routingKey: 'repair.created' },
      content: Buffer.from(JSON.stringify({ customerId: 'c1' })),
    });

    expect(mockedPrisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'admin-1', title: 'New Repair Request', type: 'admin' }),
        expect.objectContaining({ userId: 'admin-2', title: 'New Repair Request', type: 'admin' }),
      ],
    });
  });

  it('notifies registered admins when a payment completes', async () => {
    await initializeConsumer();
    (mockedPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'n2' });
    mockedPrisma.adminRecipient.findMany.mockResolvedValue([{ userId: 'admin-1' }]);
    (mockedPrisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    await consumeCallback!({
      fields: { routingKey: 'payment.completed' },
      content: Buffer.from(JSON.stringify({ customerId: 'c1', amount: 50 })),
    });

    expect(mockedPrisma.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'admin-1', title: 'Payment Received', type: 'admin' })],
    });
  });

  it('skips admin fan-out when no admins are registered', async () => {
    await initializeConsumer();
    (mockedPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'n3' });
    mockedPrisma.adminRecipient.findMany.mockResolvedValue([]);

    await consumeCallback!({
      fields: { routingKey: 'repair.created' },
      content: Buffer.from(JSON.stringify({ customerId: 'c1' })),
    });

    expect(mockedPrisma.notification.createMany).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  it('does not lose the customer notification when admin fan-out fails', async () => {
    await initializeConsumer();
    (mockedPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'n4' });
    mockedPrisma.adminRecipient.findMany.mockRejectedValue(new Error('db down'));

    await consumeCallback!({
      fields: { routingKey: 'repair.created' },
      content: Buffer.from(JSON.stringify({ customerId: 'c1' })),
    });

    expect(mockedPrisma.notification.create).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });
});
