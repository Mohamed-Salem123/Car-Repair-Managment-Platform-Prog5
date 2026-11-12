import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

// Mock the Prisma client (integration tests exercise the full HTTP stack with a mocked DB layer)
jest.mock('../src/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as any as {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Identity Service - Integration (HTTP + unit-mocked DB)', () => {
  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ service: 'identity-service', status: 'ok' });
    });
  });

  describe('POST /auth/register', () => {
    it('registers a new customer and returns token + user', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Ali Test',
        email: 'ali@test.com',
        phone: '+96170123456',
        passwordHash: 'hashed',
        role: 'CUSTOMER',
      });

      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ali Test', email: 'ali@test.com', phone: '+96170123456', password: 'secret1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      const decoded = jwt.verify(res.body.data.token, JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-1');
      expect(decoded.role).toBe('CUSTOMER');

      // bcrypt hash must be stored, never the plain password
      const createArg = (mockedPrisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.passwordHash).not.toBe('secret1');
      expect(createArg.data.passwordHash).toMatch(/^\$2[ab]\$/);
      // role is forced to CUSTOMER even if attacker supplies role field
      expect(createArg.data.role).toBe('CUSTOMER');
    });

    it('rejects duplicate email with 409', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing', email: 'ali@test.com' });

      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ali', email: 'ali@test.com', phone: '+96170123456', password: 'secret1' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER_EXISTS');
      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects invalid payload with 400 (validation middleware)', async () => {
      const res = await request(app).post('/auth/register').send({ name: 'x', email: 'not-an-email', password: '123' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects short password with 400', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ name: 'Ali', email: 'ali@test.com', phone: '+96170123456', password: '12345' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials and returns token', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('admin123', 10);
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@garage.com',
        phone: '+1234567890',
        passwordHash: hash,
        role: 'ADMIN',
      });

      const res = await request(app).post('/auth/login').send({ email: 'admin@garage.com', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      const decoded = jwt.verify(res.body.data.token, JWT_SECRET) as any;
      expect(decoded.role).toBe('ADMIN');
    });

    it('rejects wrong password with 401', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('admin123', 10);
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'admin-1', email: 'admin@garage.com', passwordHash: hash, role: 'ADMIN',
      });

      const res = await request(app).post('/auth/login').send({ email: 'admin@garage.com', password: 'wrongpass' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects unknown user with 401', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await request(app).post('/auth/login').send({ email: 'ghost@garage.com', password: 'whatever' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /users/me (authenticate middleware)', () => {
    it('returns the profile for a valid token', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1', name: 'Ali', email: 'ali@test.com', phone: '+961', role: 'CUSTOMER',
      });

      const token = jwt.sign({ userId: 'user-1', role: 'CUSTOMER' }, JWT_SECRET, { expiresIn: '1h' });
      const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('ali@test.com');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('returns 401 NO_TOKEN when no Authorization header', async () => {
      const res = await request(app).get('/users/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('NO_TOKEN');
    });

    it('returns 401 INVALID_TOKEN for a tampered token', async () => {
      const token = jwt.sign({ userId: 'user-1', role: 'CUSTOMER' }, 'wrong-secret');
      const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('returns 401 for an expired token', async () => {
      const token = jwt.sign({ userId: 'user-1', role: 'CUSTOMER' }, JWT_SECRET, { expiresIn: '-1s' });
      const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});
