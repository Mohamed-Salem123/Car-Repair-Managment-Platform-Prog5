import amqp from 'amqplib';
import { prisma } from '../db';

let channel: amqp.Channel | null = null;
const EXCHANGE_NAME = 'garage.events';

export async function initializeRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    
    // Create queue for payment service
    const queue = await channel.assertQueue('payment-service-queue', { durable: true });
    
    // Bind to repair.diagnosed event
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'repair.diagnosed');
    
    // Start consuming messages
    channel.consume(queue.queue, async (msg) => {
      if (msg) {
        try {
          const event = JSON.parse(msg.content.toString());
          await handleRepairDiagnosed(event);
          channel!.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          channel!.nack(msg, false, false);
        }
      }
    });
    
    console.log('✓ RabbitMQ channel created');
    console.log('✓ Listening for repair.diagnosed events');
  } catch (error) {
    console.error('RabbitMQ initialization error:', error);
    throw error;
  }
}

async function handleRepairDiagnosed(event: any) {
  try {
    const { repairOrderId, customerId, estimatedCost } = event;
    
    // Check if invoice already exists
    const existing = await prisma.invoice.findFirst({
      where: { repairOrderId }
    });
    
    if (existing) {
      console.log(`Invoice already exists for repair ${repairOrderId}`);
      return;
    }
    
    // Create invoice with estimated cost
    const invoice = await prisma.invoice.create({
      data: {
        repairOrderId,
        customerId,
        amount: estimatedCost || 0,
        currency: 'EUR',
        status: 'PENDING'
      }
    });
    
    console.log(`✓ Created invoice ${invoice.id} for repair ${repairOrderId}`);
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

export async function publishEvent(routingKey: string, data: any) {
  if (!channel) return;
  try {
    channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(JSON.stringify(data)), { persistent: true });
    console.log(`✓ Published event: ${routingKey}`);
  } catch (error) {
    console.error('Failed to publish event:', error);
  }
}
