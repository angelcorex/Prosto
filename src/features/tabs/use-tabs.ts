'use client';

import { useSyncExternalStore } from 'react';

export type TabKind = 'server' | 'dm';
export interface Tab { key: string; kind: TabKind; path: string; title: string; icon?: string | null; count?: number; refId?: string; ping?: number }

const STORAGE_KEY = 'prosto:tabs:v1';

let tabs: Tab[] = loadInitial();
const listeners = new Set<() => void>();

function loadInitial(): Tab[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persist() {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)); } catch { /* quota / private mode */ }
}

function emit() { persist(); listeners.forEach((l) => l()); }

/** Derive the tab key + kind for a route, or null for routes that aren't tabbed. */
export function tabKeyFor(pathname: string): { key: string; kind: TabKind } | null {
  let m = pathname.match(/^\/s\/([^/]+)/);
  if (m) return { key: `s:${m[1]}`, kind: 'server' };
  m = pathname.match(/^\/messages\/([^/]+)/);
  if (m) return { key: `dm:${m[1]}`, kind: 'dm' };
  return null;
}

/**
 * Open a tab for the current route (or update the existing tab's remembered
 * location so returning to it restores where you were).
 */
export function syncTab(pathname: string) {
  const id = tabKeyFor(pathname);
  if (!id) return;
  const i = tabs.findIndex((t) => t.key === id.key);
  if (i >= 0) {
    const cur = tabs[i];
    if (cur && cur.path !== pathname) {
      tabs = tabs.map((t, j) => (j === i ? { ...t, path: pathname } : t));
      emit();
    }
  } else {
    tabs = [...tabs, { key: id.key, kind: id.kind, path: pathname, title: '' }];
    emit();
  }
}

/** Enrich a tab with a real title / icon / live count once the destination has loaded. */
export function setTabMeta(key: string, meta: { title?: string; icon?: string | null; count?: number; refId?: string; ping?: number }) {
  const i = tabs.findIndex((t) => t.key === key);
  if (i < 0) return;
  const cur = tabs[i];
  if (!cur) return;
  const title = meta.title?.trim() ? meta.title : cur.title;
  const icon = meta.icon !== undefined ? meta.icon : cur.icon;
  const count = meta.count !== undefined ? meta.count : cur.count;
  const refId = meta.refId !== undefined ? meta.refId : cur.refId;
  const ping = meta.ping !== undefined ? meta.ping : cur.ping;
  if (cur.title === title && cur.icon === icon && cur.count === count && cur.refId === refId && cur.ping === ping) return;
  tabs = tabs.map((t, j) => (j === i ? { ...t, title, icon, count, refId, ping } : t));
  emit();
}

/** Close a tab; returns the neighbour to navigate to if the closed tab was active. */
export function closeTab(key: string): Tab | null {
  const i = tabs.findIndex((t) => t.key === key);
  if (i < 0) return null;
  const neighbour = tabs[i + 1] ?? tabs[i - 1] ?? null;
  tabs = tabs.filter((t) => t.key !== key);
  emit();
  return neighbour;
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function getSnapshot() { return tabs; }
const SERVER_SNAPSHOT: Tab[] = [];
function getServerSnapshot() { return SERVER_SNAPSHOT; }

export function useTabs(): Tab[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
