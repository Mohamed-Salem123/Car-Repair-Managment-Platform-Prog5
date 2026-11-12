import dotenv from 'dotenv';
import app from './app';
import { prisma } from './db';

dotenv.config();

const PORT = process.env.PORT || 8001;

// Database connection and server start
async function main() {
  try {
    await prisma.$connect();
    console.log('✓ Connected to identity_db');

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`✓ Identity Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start Identity Service:', error);
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
