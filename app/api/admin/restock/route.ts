import { requireAdmin } from '@/lib/admin/auth';
import { requireSameOrigin, readAdminBody, adminJson, adminFailure, AdminError } from '@/lib/admin/store';
import { listRestock, updateRestock } from '@/lib/restock';
import { getAvailability } from '@/lib/purchaseStore';
import { listEmailRestock, updateEmailRestock } from '@/lib/restockEmail';
export const runtime = 'nodejs';
export async function GET() {
  try {
    await requireAdmin();
    const [signups, emailSignups, stock] = await Promise.all([listRestock(), listEmailRestock(), getAvailability()]);
    return adminJson({ signups, emailSignups, stock });
  }
  catch (error) { return adminFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readAdminBody(request);
    if (typeof body.id !== 'string' || typeof body.action !== 'string') throw new AdminError('Invalid request.');
    if (body.channel === 'email') await updateEmailRestock(body.id, body.action);
    else await updateRestock(body.id, body.action);
    return adminJson({ saved: true });
  } catch (error) { return adminFailure(error); }
}
