import { PREORDER_MODE } from '@/lib/salesMode';
import { signupRestock } from '@/lib/restock';
import { requireSameOrigin, readAdminBody, AdminError } from '@/lib/admin/store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (PREORDER_MODE) return Response.json({ error: 'Restock alerts are paused. Please pre-order through checkout.' }, { status: 410 });
  try {
    requireSameOrigin(request);
    const body = await readAdminBody(request);
    await signupRestock(body, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown');
    return Response.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof AdminError ? error.message : 'Could not save your request. Please try again.' }, { status: error instanceof AdminError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
