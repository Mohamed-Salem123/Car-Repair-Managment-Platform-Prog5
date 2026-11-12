import { authenticate, AuthRequest } from '../src/middleware/auth.middleware';
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

describe('authenticate middleware (unit)', () => {
  it('calls next() and sets req.user for a valid Bearer token', () => {
    const token = jwt.sign({ userId: 'u1', role: 'ADMIN' }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ userId: 'u1', role: 'ADMIN' }));
  });

  it('returns 401 NO_TOKEN when header missing', () => {
    const req = { headers: {} } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('returns 401 INVALID_TOKEN for garbage token', () => {
    const req = { headers: { authorization: 'Bearer not.a.jwt' } } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects tokens signed with a different secret', () => {
    const token = jwt.sign({ userId: 'u1', role: 'ADMIN' }, 'attacker-secret');
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthRequest;
    const next = jest.fn();
    const res = makeRes();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
