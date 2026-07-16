'use client';

import Image from 'next/image';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

/** Built-in default avatars shipped in /public/material/avatars/default. */
export const DEFAULT_AVATARS = [
  '/material/avatars/default/avatar1.webp',
  '/material/avatars/default/avatar2.webp',
] as const;

export function isDefaultAvatar(url: string | null | undefined): boolean {
  return !!url && DEFAULT_AVATARS.some((a) => url.startsWith(a));
}

interface Props {
  value: string | null;
  onChange: (url: string) => void;
  size?: 'sm' | 'md';
}

/** A small row of selectable built-in avatars. */
export function DefaultAvatarPicker({ value, onChange, size = 'md' }: Props) {
  const dim = size === 'sm' ? 'h-12 w-12' : 'h-16 w-16';
  return (
    <div className="flex flex-wrap gap-3">
      {DEFAULT_AVATARS.map((url, i) => {
        const selected = value === url;
        return (
          <button
            key={url}
            type="button"
            onClick={() => onChange(url)}
            aria-label={`avatar ${i + 1}`}
            aria-pressed={selected}
            className={cn(
              'relative shrink-0 overflow-hidden rounded-full ring-2 transition-all',
              dim,
              selected ? 'ring-link' : 'ring-border/50 hover:ring-link/50',
            )}
          >
            <Image src={url} alt="" fill sizes="64px" className="object-cover" />
            {selected && (
              <span className="absolute inset-0 flex items-center justify-center bg-link/40">
                <Check className="h-5 w-5 text-white" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
