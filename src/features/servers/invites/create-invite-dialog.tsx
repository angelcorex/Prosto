'use client';

import { useState } from 'react';
import { Check, Clock, Copy, Link2, Users, X } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { Button } from '@/components/ui';
import { createServerInvite } from '../actions';

// ── Option definitions — labels come from i18n (labelKey), not hardcoded ──────

interface ExpiryOption { labelKey: string; seconds: number | null }
interface UsesOption   { labelKey: string; value: number | null }

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { labelKey: 'inviteDur30m', seconds: 1800 },
  { labelKey: 'inviteDur1h',  seconds: 3600 },
  { labelKey: 'inviteDur6h',  seconds: 21600 },
  { labelKey: 'inviteDur12h', seconds: 43200 },
  { labelKey: 'inviteDur1d',  seconds: 86400 },
  { labelKey: 'inviteDur7d',  seconds: 604800 },
  { labelKey: 'inviteDur30d', seconds: 2592000 },
  { labelKey: 'inviteDurNever', seconds: null },
];

const USES_OPTIONS: UsesOption[] = [
  { labelKey: 'inviteUses1',   value: 1 },
  { labelKey: 'inviteUses5',   value: 5 },
  { labelKey: 'inviteUses10',  value: 10 },
  { labelKey: 'inviteUses25',  value: 25 },
  { labelKey: 'inviteUses50',  value: 50 },
  { labelKey: 'inviteUses100', value: 100 },
  { labelKey: 'inviteUsesUnlimited', value: null },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface CreateInviteDialogProps {
  serverId: string;
  onClose: () => void;
  onCreated: () => void;
}

/** Selected expiry + uses shown as icon chips. Single definition, used in both
 *  the configure and the created states. */
function SummaryChips({ expiry, uses }: { expiry: string; uses: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[12px] text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {expiry}
      </span>
      <span className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[12px] text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        {uses}
      </span>
    </div>
  );
}

export function CreateInviteDialog({ serverId, onClose, onCreated }: CreateInviteDialogProps) {
  const t = useT('servers');

  // Default: 7 days, no limit.
  const [expiryIdx, setExpiryIdx] = useState(5);
  const [usesIdx,   setUsesIdx]   = useState(6);

  const [busy,   setBusy]   = useState(false);
  const [token,  setToken]  = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const inviteUrl = token ? `${site.url}/i/${token}` : null;
  const inviteHost = (() => {
    try { return new URL(site.url).host.replace(/^www\./, ''); } catch { return new URL(site.url).host; }
  })();

  const expiryLabel = t(EXPIRY_OPTIONS[expiryIdx]!.labelKey);
  const usesLabel   = t(USES_OPTIONS[usesIdx]!.labelKey);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const expiry = EXPIRY_OPTIONS[expiryIdx]!;
    const uses   = USES_OPTIONS[usesIdx]!;
    const res = await createServerInvite(serverId, expiry.seconds, uses.value);
    setBusy(false);
    if ('error' in res) { setError(String(res.error)); return; }
    if (!('token' in res)) { setError(t('errorGeneric')); return; }
    setToken(res.token);
    onCreated();
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
          <h2 className="text-[16px] font-bold">
            {token ? t('inviteCreated') : t('createInviteLink')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {!token ? (
            <>
              {/* Expiry picker */}
              <div className="mb-5">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t('inviteExpireAfter')}
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {EXPIRY_OPTIONS.map((opt, i) => (
                    <button
                      key={opt.labelKey}
                      type="button"
                      onClick={() => setExpiryIdx(i)}
                      className={cn(
                        'rounded-lg px-2 py-2 text-center text-[12px] font-medium transition-colors',
                        expiryIdx === i
                          ? 'bg-link text-white'
                          : 'bg-accent/60 text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max uses picker */}
              <div className="mb-6">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t('inviteMaxUses')}
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {USES_OPTIONS.map((opt, i) => (
                    <button
                      key={opt.labelKey}
                      type="button"
                      onClick={() => setUsesIdx(i)}
                      className={cn(
                        'rounded-lg px-2 py-2 text-center text-[12px] font-medium transition-colors',
                        usesIdx === i
                          ? 'bg-link text-white'
                          : 'bg-accent/60 text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary — selected values (fully localized) */}
              <div className="mb-4">
                <SummaryChips expiry={expiryLabel} uses={usesLabel} />
              </div>

              {error && (
                <p className="mb-3 text-[13px] text-destructive">{error}</p>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" size="md" className="flex-1" onClick={onClose}>
                  {t('cancel')}
                </Button>
                <Button size="md" className="flex-1" isLoading={busy} onClick={handleCreate}>
                  {t('generateLink')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Created — show link */}
              <p className="mb-4 text-[13px] text-muted-foreground">
                {t('inviteShareHint')}
              </p>

              <div className="flex items-center gap-2 rounded-xl bg-accent/50 px-3.5 py-2.5">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  <span className="text-muted-foreground/60">{inviteHost}/i/</span>
                  <span className="text-foreground">{token}</span>
                </span>
                <button
                  type="button"
                  onClick={copyLink}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors',
                    copied
                      ? 'bg-success/15 text-success'
                      : 'bg-link/10 text-link hover:bg-link/20',
                  )}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>

              {/* Summary badges */}
              <div className="mt-3">
                <SummaryChips expiry={expiryLabel} uses={usesLabel} />
              </div>

              <Button size="md" className="mt-5 w-full" onClick={onClose}>
                {t('done')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
