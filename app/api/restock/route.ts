import { signupRestock } from '@/lib/restock';
import { requireSameOrigin, readAdminBody, AdminError } from '@/lib/admin/store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readAdminBody(request);
    await signupRestock(body, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown');
    return Response.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof AdminError ? error.message : 'Could not save your request. Please try again.' }, { status: error instanceof AdminError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
