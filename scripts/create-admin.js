// Run this script to create an admin user
// Usage: node scripts/create-admin.js

const bcrypt = require('bcrypt');

async function generateAdminHash() {
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  
  console.log('\n=== CREATE ADMIN USER ===\n');
  console.log('Run this SQL in your PostgreSQL database:\n');
  console.log('docker exec -it garage-postgres psql -U postgres -d identity_db\n');
  console.log('Then paste this SQL:\n');
  console.log(`
INSERT INTO users (id, name, email, phone, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'Admin User',
  'admin@garage.com',
  '+1234567890',
  '${hash}',
  'ADMIN',
  NOW(),
  NOW()
);
`);
  console.log('\nAdmin Login Credentials:');
  console.log('Email: admin@garage.com');
  console.log('Password: admin123');
  console.log('\n⚠️  Change this password in production!\n');
}

generateAdminHash().catch(console.error);
