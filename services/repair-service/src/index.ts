import dotenv from 'dotenv';
import app from './app';
import { prisma } from './db';
import { initializeRabbitMQ } from './services/rabbitmq.service';

dotenv.config();

const PORT = process.env.PORT || 8002;

// Database and RabbitMQ initialization
async function main() {
  try {
    await prisma.$connect();
    console.log('✓ Connected to repair_db');

    await initializeRabbitMQ();
    console.log('✓ Connected to RabbitMQ');

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`✓ Repair Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start Repair Service:', error);
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
