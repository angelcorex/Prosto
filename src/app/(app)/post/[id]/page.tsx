import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { getT } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/request';
import { createClient } from '@/lib/supabase/server';
import { PostCard, mapFeedRow } from '@/features/posts';

interface Props { params: Promise<{ id: string }> }

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getT('posts');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .rpc('get_single_post', { post_id: id, viewer: user?.id ?? null });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: me } = user ? await (supabase as any)
    .from('profiles').select('username').eq('id', user.id).maybeSingle() : { data: null };

  const post = mapFeedRow(row);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="sticky top-0 z-sticky flex items-center gap-3 border-b border-border/30 bg-background/95 px-4 py-3.5">
        <Link href="/feed" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label={t('back')}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-[16px] font-bold">{t('postTitle')}</h1>
      </div>

      <div className="px-4 pt-3">
        <PostCard post={post} locale={locale} currentUsername={me?.username ?? null} />
      </div>
    </div>
  );
}
