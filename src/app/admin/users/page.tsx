import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n';
import { UsersTable } from '@/features/admin';
import type { AdminUser } from '@/features/admin';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = (q ?? '').trim();
  const t = await getT('admin');
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('admin_list_users', {
    search: search || null,
    lim: 50,
    off: 0,
  });
  const users: AdminUser[] = Array.isArray(data) ? data : [];

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold">{t('navUsers')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('usersSubtitle')}</p>
      </header>
      <UsersTable initialUsers={users} initialSearch={search} />
    </div>
  );
}
