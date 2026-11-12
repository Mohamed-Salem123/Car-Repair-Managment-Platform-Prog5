INSERT INTO users (id, name, email, phone, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'Admin User',
  'admin@garage.com',
  '+1234567890',
  '$2b$10$rKvVXhGEAXQJZ5xZJYxMu.X5J3jKL7CqXqI1rJ0yZLx1YqKqYqKqu',
  'ADMIN',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
