'use client';

import { Fragment } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils/cn';
import { renderEmojiNodes } from '@/components/ui';

// Split on #hashtags (Latin + Cyrillic, digits, underscore) and http(s) links,
// keeping the delimiters so they can be rendered as clickable elements.
const TOKEN_SPLIT = /(#[0-9A-Za-zА-Яа-яЁё_]{1,50}|https?:\/\/[^\s]+)/g;
const HASHTAG_ONE = /^#[0-9A-Za-zА-Яа-яЁё_]{1,50}$/;
const URL_ONE = /^https?:\/\/[^\s]+$/;

/**
 * Post body with clickable #hashtags and links. A tap on a tag opens search
 * filtered to that hashtag; links open in a new tab. Everything else renders
 * as plain (pre-wrapped) text.
 */
export function PostText({ content, className }: { content: string; className?: string }) {
  const parts = content.split(TOKEN_SPLIT);

  return (
    <p className={cn('mb-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground', className)}>
      {parts.map((part, i) => {
        if (part && HASHTAG_ONE.test(part)) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              href={`/search?q=${encodeURIComponent('#' + tag)}`}
              className="font-medium text-link hover:underline"
            >
              {part}
            </Link>
          );
        }
        if (part && URL_ONE.test(part)) {
          // Peel trailing punctuation so "site.com/." doesn't swallow the dot.
          const m = part.match(/^(.*?)([.,!?;:)\]}]*)$/s);
          const url = m?.[1] || part;
          const trail = m?.[2] ?? '';
          return (
            <Fragment key={i}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">{url}</a>
              {trail}
            </Fragment>
          );
        }
        return <Fragment key={i}>{renderEmojiNodes(part, { keyPrefix: `e${i}-` })}</Fragment>;
      })}
    </p>
  );
}
