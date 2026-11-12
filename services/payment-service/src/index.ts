import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import paymentRoutes from './routes/payment.routes';
import { initializeRabbitMQ } from './services/rabbitmq.service';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8003;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'payment-service', status: 'ok' });
});

app.use('/invoices', paymentRoutes);

async function main() {
  try {
    await prisma.$connect();
    console.log('✓ Connected to payment_db');

    await initializeRabbitMQ();
    console.log('✓ Connected to RabbitMQ');

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`✓ Payment Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start Payment Service:', error);
    process.exit(1);
  }
}

main();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export { prisma };
