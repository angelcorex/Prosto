'use client';

import { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';

/**
 * One-time token reveal. The plaintext token exists only in this modal — it's
 * never persisted or returned again (only its hash is stored). The developer
 * must copy it now; closing requires acknowledging that.
 */
export function TokenRevealModal({ token, onClose }: { token: string; onClose: () => void }) {
  const t = useT('developers');
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the developer can select the text manually */
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <Card className="w-full max-w-lg space-y-4 p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t('tokenRevealTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('tokenRevealBody')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm">{token}</code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 rounded border-border" />
          {t('tokenRevealAck')}
        </label>

        <div className="flex justify-end">
          <Button onClick={onClose} disabled={!ack}>{t('tokenRevealDone')}</Button>
        </div>
      </Card>
    </div>
  );
}
