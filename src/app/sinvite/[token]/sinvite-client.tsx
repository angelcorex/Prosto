'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Server, Check } from 'lucide-react';

import { site } from '@/config';
import { Button, ServerVerifiedBadge } from '@/components/ui';
import { acceptServerInvite } from '@/features/servers';
import type { ServerInvitePreview } from '@/features/servers/invites/invite-data';

export type { ServerInvitePreview };

interface Labels {
  question: string;
  subtitle: string;
  join: string;
  signIn: string;
  notFound: string;
  members: string;
  errorGeneric: string;
  banned: string;
}

export function SInviteClient({
  invite, token, authed, signInHref, labels,
}: {
  invite: ServerInvitePreview | null;
  token: string;
  authed: boolean;
  signInHref: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invite) {
    return <Shell><p className="text-center text-[15px] text-muted-foreground">{labels.notFound}</p></Shell>;
  }

  const initial = invite.name[0]?.toUpperCase() ?? '?';

  async function join() {
    setBusy(true); setError(null);
    const res = await acceptServerInvite(token);
    if ('publicId' in res && res.publicId) { router.push(site.routes.server(res.publicId)); return; }
    setBusy(false);
    setError('error' in res && res.error === 'banned' ? labels.banned : labels.errorGeneric);
  }

  return (
    <Shell>
      <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl bg-accent">
        {invite.icon_url
          ? <Image src={invite.icon_url} alt={invite.name} width={72} height={72} className="h-full w-full object-cover" />
          : <span className="text-2xl font-bold">{initial}</span>}
      </div>
      <h1 className="mt-4 flex items-center justify-center gap-1.5 text-center text-xl font-bold tracking-tight">
        {invite.is_verified && <ServerVerifiedBadge size="md" />}
        {invite.name}
      </h1>
      <p className="mt-0.5 text-center text-[13px] text-muted-foreground">{invite.member_count} {labels.members}</p>

      {invite.description && (
        <p className="mt-3 text-center text-[14px] leading-relaxed text-muted-foreground/90">{invite.description}</p>
      )}
      {invite.tags && invite.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {invite.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground">#{tag}</span>
          ))}
        </div>
      )}

      <p className="mt-5 text-center text-[15px] font-medium">{labels.question}</p>
      <p className="mt-1 text-center text-[13px] text-muted-foreground">{labels.subtitle}</p>
      {error && <p className="mt-3 text-center text-[13px] text-destructive">{error}</p>}

      <div className="mt-6">
        {authed ? (
          <Button size="md" className="w-full" isLoading={busy} onClick={join}>
            <Check className="h-[18px] w-[18px]" /> {labels.join}
          </Button>
        ) : (
          <Link href={signInHref} className="block"><Button size="md" className="w-full">{labels.signIn}</Button></Link>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-lg">
        <div className="mb-5 flex items-center justify-center gap-2 text-muted-foreground">
          <Server className="h-4 w-4 text-link" />
          <span className="text-[12px] font-semibold uppercase tracking-wider">{site.name}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
