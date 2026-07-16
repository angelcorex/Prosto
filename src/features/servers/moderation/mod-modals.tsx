'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Ban, Timer, Crown } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { Button, Input, Textarea, Label } from '@/components/ui';
import { banMember, timeoutMember, transferServerOwnership } from '../actions';

/** Small centered modal shell shared by the moderation dialogs. */
function ModalShell({ title, icon, onClose, children }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">{icon}{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Timeout duration presets (seconds). */
const DURATIONS: { key: string; secs: number }[] = [
  { key: 'dur60s', secs: 60 },
  { key: 'dur5m', secs: 300 },
  { key: 'dur10m', secs: 600 },
  { key: 'dur1h', secs: 3600 },
  { key: 'dur1d', secs: 86400 },
  { key: 'dur1w', secs: 604800 },
  { key: 'dur1mo', secs: 2592000 },
];

const UNIT_SECS = { minutes: 60, hours: 3600, days: 86400 } as const;
type Unit = keyof typeof UNIT_SECS;

export function TimeoutModal({ serverId, memberId, username, onClose, onDone }: {
  serverId: string; memberId: string; username: string; onClose: () => void; onDone?: () => void;
}) {
  const t = useT('servers');
  const [secs, setSecs] = useState(300);
  const [custom, setCustom] = useState(false);
  const [customNum, setCustomNum] = useState('30');
  const [unit, setUnit] = useState<Unit>('minutes');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveSecs = custom ? Math.max(1, Math.floor(Number(customNum) || 0)) * UNIT_SECS[unit] : secs;

  async function submit() {
    if (busy || effectiveSecs <= 0) return;
    setBusy(true);
    const res = await timeoutMember(serverId, memberId, effectiveSecs, reason.trim() || undefined);
    setBusy(false);
    if (!('error' in res)) { window.dispatchEvent(new CustomEvent('server:changed')); onDone?.(); onClose(); }
  }

  return (
    <ModalShell title={t('timeoutTitle', { name: username })} icon={<Timer className="h-5 w-5 text-warning" />} onClose={onClose}>
      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{t('timeoutDuration')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => { setCustom(false); setSecs(d.secs); }}
                className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                  !custom && secs === d.secs ? 'bg-link text-white' : 'bg-secondary/60 text-muted-foreground hover:bg-accent')}
              >
                {t(d.key)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustom(true)}
              className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                custom ? 'bg-link text-white' : 'bg-secondary/60 text-muted-foreground hover:bg-accent')}
            >
              {t('durCustom')}
            </button>
          </div>
          {custom && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={customNum}
                onChange={(e) => setCustomNum(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-24"
              />
              <div className="flex rounded-lg bg-secondary/60 p-0.5 text-[13px] font-medium">
                {(Object.keys(UNIT_SECS) as Unit[]).map((u) => (
                  <button key={u} type="button" onClick={() => setUnit(u)}
                    className={cn('rounded-md px-2.5 py-1 transition-colors', unit === u ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                    {t(`unit_${u}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to-reason">{t('modReason')}</Label>
          <Textarea id="to-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} maxLength={300} rows={2} placeholder={t('modReasonPlaceholder')} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button size="md" onClick={submit} isLoading={busy}>{t('timeoutConfirm')}</Button>
      </div>
    </ModalShell>
  );
}

export function BanModal({ serverId, memberId, username, onClose, onDone }: {
  serverId: string; memberId: string; username: string; onClose: () => void; onDone?: () => void;
}) {
  const t = useT('servers');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const res = await banMember(serverId, memberId, reason.trim() || undefined);
    setBusy(false);
    if (!('error' in res)) { window.dispatchEvent(new CustomEvent('server:changed')); onDone?.(); onClose(); }
  }

  return (
    <ModalShell title={t('banTitle', { name: username })} icon={<Ban className="h-5 w-5 text-destructive" />} onClose={onClose}>
      <p className="mt-2 text-[13px] text-muted-foreground">{t('banNote')}</p>
      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="ban-reason">{t('modReason')}</Label>
        <Textarea id="ban-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} maxLength={300} rows={2} placeholder={t('modReasonPlaceholder')} />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button variant="destructive" size="md" onClick={submit} isLoading={busy}>{t('banConfirm')}</Button>
      </div>
    </ModalShell>
  );
}

/** The literal word the user must type to confirm an ownership transfer. */
const CONFIRM_WORD = 'CONFIRM';

export function TransferOwnerModal({ serverId, memberId, username, onClose, onDone }: {
  serverId: string; memberId: string; username: string; onClose: () => void; onDone?: () => void;
}) {
  const t = useT('servers');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = text.trim() === CONFIRM_WORD;

  async function submit() {
    if (busy || !ok) return;
    setBusy(true);
    const res = await transferServerOwnership(serverId, memberId);
    setBusy(false);
    if (!('error' in res)) { window.dispatchEvent(new CustomEvent('server:changed')); window.dispatchEvent(new CustomEvent('servers:changed')); onDone?.(); onClose(); }
  }

  return (
    <ModalShell title={t('transferTitle')} icon={<Crown className="h-5 w-5 text-warning" />} onClose={onClose}>
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-[13px] text-muted-foreground">{t('transferWarn', { name: username })}</p>
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="transfer-confirm">{t('transferConfirmType', { word: CONFIRM_WORD })}</Label>
        <Input id="transfer-confirm" value={text} onChange={(e) => setText(e.target.value)} placeholder={CONFIRM_WORD} autoFocus spellCheck={false} />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button variant="destructive" size="md" onClick={submit} isLoading={busy} disabled={!ok}>{t('transferConfirm')}</Button>
      </div>
    </ModalShell>
  );
}

export type ModAction = 'timeout' | 'ban' | 'transfer';

/** Renders the right modal for a chosen moderation action (or nothing). */
export function ModActionModal({ action, serverId, memberId, username, onClose, onDone }: {
  action: ModAction | null; serverId: string; memberId: string; username: string; onClose: () => void; onDone?: () => void;
}) {
  if (!action) return null;
  const props = { serverId, memberId, username, onClose, onDone };
  if (action === 'timeout') return <TimeoutModal {...props} />;
  if (action === 'ban') return <BanModal {...props} />;
  return <TransferOwnerModal {...props} />;
}
