import { authenticate, requireRole, AuthRequest } from '../src/middleware/auth.middleware';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

describe('repair-service auth middleware (unit)', () => {
  it('authenticate calls next() for a valid token', () => {
    const token = jwt.sign({ userId: 'u1', role: 'CUSTOMER' }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ userId: 'u1', role: 'CUSTOMER' }));
  });

  it('authenticate returns 401 without token', () => {
    const req = { headers: {} } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    authenticate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('authenticate returns 401 for invalid token', () => {
    const req = { headers: { authorization: 'Bearer bad.token.here' } } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    authenticate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('requireRole(ADMIN) passes for ADMIN', () => {
    const middleware = requireRole('ADMIN');
    const req = { user: { userId: 'a1', role: 'ADMIN' } } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('requireRole(ADMIN) blocks CUSTOMER with 403', () => {
    const middleware = requireRole('ADMIN');
    const req = { user: { userId: 'c1', role: 'CUSTOMER' } } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('requireRole blocks when req.user is missing', () => {
    const middleware = requireRole('CUSTOMER');
    const req = {} as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
