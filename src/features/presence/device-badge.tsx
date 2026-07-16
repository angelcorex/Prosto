'use client';

import { useEffect, useState } from 'react';
import { Monitor, Smartphone, Apple } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { Tooltip, BadgeCluster } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { usePresenceTick, getPresence, ensureDevice } from './use-presence-store';
import { effectiveStatus } from './presence';

const ICONS = { apple: Apple, mobile: Smartphone, desktop: Monitor } as const;
type DeviceKey = keyof typeof ICONS;

/**
 * Icons next to a username showing which device(s) the user is online from —
 * one per active device (e.g. computer + phone at once). Hidden when offline.
 * Live device set comes from realtime presence; a single device from the DB is
 * used as a fallback before the realtime sync arrives.
 *
 * Renders nothing until mounted: device data is client-only and would otherwise
 * differ from the server-rendered HTML and trip a hydration mismatch.
 */
/**
 * @param collapse When set, two or more device icons are tucked behind a single
 * expandable trigger (same behaviour as the profile-badge cluster). A single
 * device still shows inline.
 */
export function DeviceBadge({ userId, className, collapse = false }: { userId?: string | null; className?: string; collapse?: boolean }) {
  usePresenceTick();
  const t = useT('status');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => ensureDevice(userId ?? undefined), [userId]);

  if (!mounted || !userId) return null;
  const p = getPresence(userId);
  if (!p) return null;
  const st = effectiveStatus(p.status, p.last_seen);
  if (st === 'offline') return null; // offline → device icons hidden entirely

  // Tint the device icons to match the presence dot: green online, amber idle,
  // red do-not-disturb.
  const statusColor =
    st === 'dnd' ? 'text-destructive'
    : st === 'idle' ? 'text-warning'
    : 'text-success';

  const list = p.devices ?? [];
  const devices = [...new Set(list)].filter((d): d is DeviceKey => d in ICONS);
  if (devices.length === 0) return null;

  const icons = devices.map((d) => {
    const Icon = ICONS[d];
    const label = t(`device.${d}`);
    return (
      <Tooltip key={d} side="top" content={label}>
        <span className="inline-flex items-center" aria-label={label}>
          <Icon className="h-4 w-4" />
        </span>
      </Tooltip>
    );
  });

  // Collapse multiple devices (e.g. desktop + phone) behind one trigger.
  if (collapse) {
    return <BadgeCluster className={cn(statusColor, className)}>{icons}</BadgeCluster>;
  }

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', statusColor, className)}>
      {icons}
    </span>
  );
}
