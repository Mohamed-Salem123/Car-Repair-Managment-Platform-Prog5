/**
 * Unit tests for the RabbitMQ event contract of repair-service (producer side).
 * Verifies: exchange name/type, that publishEvent publishes with the exact
 * routing keys the system documentation defines, and message persistence flags.
 */

const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue({}),
  assertQueue: jest.fn().mockResolvedValue({ queue: 'q' }),
  bindQueue: jest.fn().mockResolvedValue({}),
  consume: jest.fn().mockReturnValue({}),
  publish: jest.fn(),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
};

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockConnection),
  __esModule: true,
  default: {
    connect: jest.fn().mockResolvedValue(mockConnection),
  },
}));

import * as rabbitmq from '../src/services/rabbitmq.service';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  // Re-require to reset module-level `channel` state between tests
  const fresh = require('../src/services/rabbitmq.service');
  Object.assign(rabbitmq, fresh);
});

describe('repair-service rabbitmq producer (unit)', () => {
  it('initializes a durable topic exchange named garage.events', async () => {
    await rabbitmq.initializeRabbitMQ();
    expect(mockConnection.createChannel).toHaveBeenCalled();
    expect(mockChannel.assertExchange).toHaveBeenCalledWith('garage.events', 'topic', { durable: true });
  });

  it('publishes events to garage.events with persistent flag', async () => {
    await rabbitmq.initializeRabbitMQ();
    await rabbitmq.publishEvent('repair.created', { repairOrderId: 'r1', customerId: 'c1' });

    expect(mockChannel.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey, content, options] = (mockChannel.publish as jest.Mock).mock.calls[0];
    expect(exchange).toBe('garage.events');
    expect(routingKey).toBe('repair.created');
    expect(JSON.parse(content.toString())).toEqual({ repairOrderId: 'r1', customerId: 'c1' });
    expect(options.persistent).toBe(true);
  });

  it('publishes each lifecycle event with its documented routing key', async () => {
    await rabbitmq.initializeRabbitMQ();
    const events = ['repair.created', 'repair.diagnosed', 'repair.started', 'repair.ready', 'repair.completed'];
    for (const key of events) {
      await rabbitmq.publishEvent(key, {});
      expect(mockChannel.publish).toHaveBeenLastCalledWith('garage.events', key, expect.any(Buffer), expect.anything());
    }
  });

  it('does not throw when publishing before initialization (fail-safe)', async () => {
    await expect(rabbitmq.publishEvent('repair.created', {})).resolves.toBeUndefined();
    expect(mockChannel.publish).not.toHaveBeenCalled();
  });
});
