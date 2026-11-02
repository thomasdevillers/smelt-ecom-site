import { signupRestock } from '@/lib/restock';
import { signupEmailRestock } from '@/lib/restockEmail';
import { requireSameOrigin, readAdminBody, AdminError } from '@/lib/admin/store';
export const runtime = 'nodejs';
export async function POST(request: Request) {

  try {
    requireSameOrigin(request);
    const body = await readAdminBody(request);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if ('email' in body) return Response.json(await signupEmailRestock(body, ip), { headers: { 'Cache-Control': 'no-store' } });
    await signupRestock(body, ip);
    return Response.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof AdminError ? error.message : 'Could not save your request. Please try again.' }, { status: error instanceof AdminError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
