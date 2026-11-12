-- Delete existing admin if any
DELETE FROM users WHERE email = 'admin@garage.com';

-- Insert admin with correct password hash
INSERT INTO users (id, name, email, phone, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'Admin User',
  'admin@garage.com',
  '+1234567890',
  '$2b$10$TvSV3fzMaPoEV.b88w6rIOc4u1ls.3KiSjYXSAyXxMzaxvWzfWnXq',
  'ADMIN',
  NOW(),
  NOW()
);
