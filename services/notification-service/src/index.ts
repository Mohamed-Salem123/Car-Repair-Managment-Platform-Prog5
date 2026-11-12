import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import notificationRoutes from './routes/notification.routes';
import { initializeConsumer } from './services/rabbitmq.service';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8004;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'notification-service', status: 'ok' });
});

app.use('/notifications', notificationRoutes);

async function main() {
  try {
    await prisma.$connect();
    console.log('✓ Connected to notification_db');

    await initializeConsumer();
    console.log('✓ RabbitMQ consumer initialized');

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`✓ Notification Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start Notification Service:', error);
    process.exit(1);
  }
}

main();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export { prisma };
