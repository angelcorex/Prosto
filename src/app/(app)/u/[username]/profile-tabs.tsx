'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils/cn';

export function ProfileTabs({
  active,
  postsLabel,
  likesLabel,
}: {
  active: 'posts' | 'likes';
  postsLabel: string;
  likesLabel: string;
}) {
  const pathname = usePathname();

  const tabs = [
    { key: 'posts', label: postsLabel, href: pathname },
    { key: 'likes', label: likesLabel, href: `${pathname}?tab=likes` },
  ] as const;

  return (
    <div className="flex gap-1 rounded-2xl bg-muted/50 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          scroll={false}
          className={cn(
            'flex-1 rounded-xl py-2.5 text-center text-sm font-medium transition-colors duration-fast',
            active === tab.key
              ? 'bg-accent text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
