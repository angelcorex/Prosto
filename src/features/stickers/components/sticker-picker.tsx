'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@/providers/i18n-provider';
import { STICKERS, stickerUrl } from '../stickers';

interface StickerPickerProps {
  onSelect: (id: string) => void;
  children: React.ReactNode;
}

export function StickerPicker({ onSelect, children }: StickerPickerProps) {
  const t = useT('messages');
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Position the popup above the trigger BEFORE paint (no corner flash).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const W = 320, H = 380;
    let left = rect.right - W + window.scrollX;
    if (left < 8) left = 8;
    let top = rect.top - H - 8 + window.scrollY;
    if (rect.top - H - 8 < 8) top = rect.bottom + 8 + window.scrollY;
    setCoords({ top, left });
    setReady(true);
  }, [open]);

  // Reset the placement gate on close so the next open re-positions first.
  useEffect(() => { if (!open) setReady(false); }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen((v) => !v)} className="inline-flex">
        {children}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999, transformOrigin: 'bottom right', visibility: ready ? 'visible' : 'hidden' }}
          className="surface-solid flex h-[380px] w-[320px] flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl animate-profile-pop"
        >
          <div className="shrink-0 px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t('stickers')}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-3 gap-2">
              {STICKERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { onSelect(id); setOpen(false); }}
                  className="flex aspect-square items-center justify-center rounded-xl p-1.5 transition-colors hover:bg-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stickerUrl(id)} alt="" draggable={false} className="h-full w-full select-none object-contain" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
