import amqp from 'amqplib';

let channel: amqp.Channel | null = null;
const EXCHANGE_NAME = 'garage.events';

export async function initializeRabbitMQ() {
  try {
    const connection = await amqp.connect(
      process.env.RABBITMQ_URL || 'amqp://localhost:5672'
    );
    channel = await connection.createChannel();

    // Create topic exchange
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    console.log('✓ RabbitMQ channel created');
  } catch (error) {
    console.error('RabbitMQ initialization error:', error);
    throw error;
  }
}

export async function publishEvent(routingKey: string, data: any) {
  if (!channel) {
    console.error('RabbitMQ channel not initialized');
    return;
  }

  try {
    const message = JSON.stringify(data);
    channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(message), {
      persistent: true,
    });
    console.log(`✓ Published event: ${routingKey}`);
  } catch (error) {
    console.error('Failed to publish event:', error);
  }
}
