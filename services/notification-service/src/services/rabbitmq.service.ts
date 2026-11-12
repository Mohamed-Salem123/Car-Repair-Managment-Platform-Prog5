import amqp from 'amqplib';
import { prisma } from '../db';

const EXCHANGE_NAME = 'garage.events';
const QUEUE_NAME = 'notification-queue';

const EVENT_HANDLERS: Record<string, (data: any) => Promise<void>> = {
  'repair.created': async (data) => {
    await prisma.notification.create({
      data: {
        userId: data.customerId,
        title: 'Repair Request Received',
        message: 'Your repair request has been received successfully.',
        type: 'repair',
      },
    });
    await notifyAdmins(
      'New Repair Request',
      'A new repair request has been submitted and awaits review.',
      'admin'
    );
  },
  'repair.diagnosed': async (data) => {
    await prisma.notification.create({
      data: {
        userId: data.customerId,
        title: 'Vehicle Diagnosed',
        message: 'Your vehicle has been diagnosed. Check the repair details.',
        type: 'repair',
      },
    });
  },
  'repair.started': async (data) => {
    await prisma.notification.create({
      data: {
        userId: data.customerId,
        title: 'Repair In Progress',
        message: 'Your vehicle repair work has started.',
        type: 'repair',
      },
    });
  },
  'repair.ready': async (data) => {
    await prisma.notification.create({
      data: {
        userId: data.customerId,
        title: 'Vehicle Ready',
        message: 'Your vehicle is ready for pickup.',
        type: 'repair',
      },
    });
  },
  'repair.completed': async (data) => {
    await prisma.notification.create({
      data: {
        userId: data.customerId,
        title: 'Repair Completed',
        message: 'Your vehicle repair has been completed.',
        type: 'repair',
      },
    });
  },
  'payment.completed': async (data) => {
    await prisma.notification.create({
      data: {
        userId: data.customerId,
        title: 'Payment Successful',
        message: `Your payment of €${data.amount} has been completed successfully.`,
        type: 'payment',
      },
    });
    await notifyAdmins(
      'Payment Received',
      `A customer payment of €${data.amount} has been completed (repair ${data.repairOrderId}).`,
      'admin'
    );
  },
};

/**
 * Creates notifications for all registered admin recipients.
 * Best-effort: a failure here must not lose the customer notification,
 * so errors are logged and swallowed (the message is still acked).
 */
async function notifyAdmins(title: string, message: string, type: string) {
  try {
    const admins = await prisma.adminRecipient.findMany();
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((admin) => ({ userId: admin.userId, title, message, type })),
    });
  } catch (error) {
    console.error('Failed to notify admins:', error);
  }
}

export async function initializeConsumer() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Bind to all events
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'repair.*');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'payment.*');

    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg) {
        try {
          const routingKey = msg.fields.routingKey;
          const data = JSON.parse(msg.content.toString());

          console.log(`Received event: ${routingKey}`);

          const handler = EVENT_HANDLERS[routingKey];
          if (handler) {
            await handler(data);
            console.log(`✓ Notification created for: ${routingKey}`);
          }

          channel.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          channel.nack(msg, false, false);
        }
      }
    });

    console.log('✓ RabbitMQ consumer ready');
  } catch (error) {
    console.error('RabbitMQ consumer initialization error:', error);
    throw error;
  }
}
