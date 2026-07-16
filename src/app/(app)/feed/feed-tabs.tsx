'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

type Tab = { key: string; label: string };

export function FeedTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? '');

  return (
    <div className="flex pt-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActive(tab.key)}
          className={cn(
            'flex-1 px-4 py-3.5 text-[15px] font-medium transition-colors duration-fast',
            'border-b-2',
            active === tab.key
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
