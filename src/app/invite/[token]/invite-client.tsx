'use client';
import { AvatarImage } from '@/components/ui/avatar-image';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Check, X } from 'lucide-react';

import { site } from '@/config';
import { Button, VerifiedBadge, ModeratorBadge, renderEmojiNodes } from '@/components/ui';
import { acceptFriendInvite } from '@/features/social';

export interface InvitePreview {
  inviter_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  public_id: string;
  is_verified: boolean;
  is_moderator: boolean;
}

interface Labels {
  addQuestion: string;
  subtitle: string;
  yes: string;
  no: string;
  signIn: string;
  notFound: string;
  self: string;
  adding: string;
  errorSelf: string;
  errorBlocked: string;
  errorGeneric: string;
}

interface Props {
  token: string;
  invite: InvitePreview | null;
  authed: boolean;
  isSelf: boolean;
  signInHref: string;
  labels: Labels;
}

export function InviteClient({ invite, token, authed, isSelf, signInHref, labels }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invite) {
    return (
      <Shell>
        <p className="text-center text-[15px] text-muted-foreground">{labels.notFound}</p>
        <Link href={site.routes.home} className="mt-4 text-sm text-link hover:underline">Prosto</Link>
      </Shell>
    );
  }

  const name = invite.display_name?.trim() || invite.username;
  const initial = name[0]?.toUpperCase() ?? '?';

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await acceptFriendInvite(token);
    if (res.error) {
      setBusy(false);
      if (res.error.includes('self')) setError(labels.errorSelf);
      else if (res.error.includes('blocked')) setError(labels.errorBlocked);
      else setError(labels.errorGeneric);
      return;
    }
    // Open the freshly-created DM with the new friend.
    router.push(res.publicId ? site.routes.messages + '/' + res.publicId : site.routes.messages);
  }

  return (
    <Shell>
      {/* Avatar */}
      <div className="relative mx-auto h-[88px] w-[88px] overflow-hidden rounded-full bg-link/20 ring-4 ring-card">
        {invite.avatar_url ? (
          <AvatarImage src={invite.avatar_url} alt={name} className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-link">{initial}</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        <h1 className="text-xl font-bold tracking-tight">{renderEmojiNodes(name)}</h1>
        {invite.is_verified && <VerifiedBadge size="md" />}
        {invite.is_moderator && <ModeratorBadge size="md" />}
      </div>
      <p className="mt-0.5 text-center text-[13px] text-muted-foreground">@{invite.username}</p>

      <p className="mt-5 text-center text-[15px] font-medium">{labels.addQuestion}</p>
      <p className="mt-1 text-center text-[13px] text-muted-foreground">{labels.subtitle}</p>

      {error && <p className="mt-3 text-center text-[13px] text-destructive">{error}</p>}

      {/* Actions */}
      <div className="mt-6">
        {!authed ? (
          <Link href={signInHref} className="block">
            <Button size="md" className="w-full">{labels.signIn}</Button>
          </Link>
        ) : isSelf ? (
          <p className="text-center text-[13px] text-muted-foreground">{labels.self}</p>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="md" className="flex-1" disabled={busy} onClick={() => router.push(site.routes.feed)}>
              <X className="h-[18px] w-[18px]" />
              {labels.no}
            </Button>
            <Button size="md" className="flex-1" isLoading={busy} onClick={accept}>
              <Check className="h-[18px] w-[18px]" />
              {labels.yes}
            </Button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
      <div className="relative w-full max-w-sm rounded-3xl bg-card p-7 shadow-lg">
        <div className="mb-5 flex items-center justify-center gap-2 text-muted-foreground">
          <UserPlus className="h-4 w-4 text-link" />
          <span className="text-[12px] font-semibold uppercase tracking-wider">{site.name}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
