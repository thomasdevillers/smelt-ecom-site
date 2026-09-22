import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eval: vi.fn(), hgetall: vi.fn(), hdel: vi.fn(), admin: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: class { eval = mocks.eval; hgetall = mocks.hgetall; hdel = mocks.hdel; } }));
vi.mock('./admin/auth', () => ({ requireAdmin: mocks.admin }));
vi.mock('./preorderStore', () => ({ getAvailability: vi.fn() }));
import { POST } from '../app/api/restock/route';
import { GET } from '../app/api/admin/restock/route';
import { AdminError } from './admin/store';
const request = (body: unknown, origin = 'https://saunahat.co.za') => new Request('https://saunahat.co.za/api/restock', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.com'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test'); mocks.eval.mockResolvedValue(1); });
describe('restock requests', () => {
  it('normalizes a South African phone number, records consent and returns no private data', async () => {
    const response = await POST(request({ colour: 'green', phone: '082 123 4567', consent: true }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ saved: true });
    expect(JSON.parse(mocks.eval.mock.calls[0][2][1])).toMatchObject({ colour: 'green', phone: '27821234567', notifiedAt: null });
  });
  it.each([{ colour: 'green', phone: '0821234567', consent: false }, { colour: 'purple', phone: '0821234567', consent: true }, { colour: 'cream', phone: 'not a phone', consent: true }])('rejects invalid input without persistence', async body => {
    expect((await POST(request(body))).status).toBe(400); expect(mocks.eval).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests and private-list reads without login', async () => {
    expect((await POST(request({}, 'https://other.example'))).status).toBe(403);
    mocks.admin.mockRejectedValueOnce(new AdminError('Sign in.', 401));
    expect((await GET()).status).toBe(401); expect(mocks.hgetall).not.toHaveBeenCalled();
  });
  it('reports rate limits and storage failures without claiming a signup was saved', async () => {
    mocks.eval.mockResolvedValueOnce(0);
    expect((await POST(request({ colour: 'green', phone: '0821234567', consent: true }))).status).toBe(429);
    mocks.eval.mockRejectedValueOnce(new Error('offline'));
    expect((await POST(request({ colour: 'green', phone: '0821234567', consent: true }))).status).toBe(503);
  });
});
