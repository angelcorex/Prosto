'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Trophy, MessagesSquare, Info, Pencil, Eraser, Crown, Users, ImagePlus, Loader2, Menu } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { Button, VerifiedBadge, ServerVerifiedBadge, MiniProfilePopup, ColorPicker, ImageCropper, renderEmojiNodes } from '@/components/ui';
import { openNavDrawer } from '@/components/shell';
import { updateServerSettings, uploadServerHomeAsset, updateServerHome } from './actions';

interface Props {
  serverId: string;
  publicId: string;
  name: string;
  icon: string | null;
  banner: string | null;
  homeBanner: string | null;
  homeWhiteboard: string | null;
  description: string | null;
  memberCount: number;
  isVerified: boolean;
  canManage: boolean;
}

const isGradient = (v: string | null): v is string => !!v && v.startsWith('linear-gradient');

export function ServerHome(props: Props) {
  const t = useT('servers');
  const sbRef = useRef(createClient());
  const [online, setOnline] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(props.homeBanner ?? props.banner);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('get_server_members', { p_server: props.serverId }).then(({ data }: { data: { last_seen: string | null }[] | null }) => {
      if (!active || !Array.isArray(data)) return;
      const cutoff = Date.now() - 5 * 60 * 1000;
      setOnline(data.filter((m) => m.last_seen && new Date(m.last_seen).getTime() > cutoff).length);
    });
    return () => { active = false; };
  }, [props.serverId]);

  function pickFile(file: File | undefined) {
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  async function applyCrop(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setBannerBusy(true);
    const fd = new FormData();
    fd.append('file', new File([blob], 'home-banner.jpg', { type: 'image/jpeg' }));
    const res = await uploadServerHomeAsset(props.serverId, 'banner', fd);
    if ('url' in res && res.url) {
      setBanner(res.url);
      await updateServerHome(props.serverId, { banner: res.url });
    }
    setBannerBusy(false);
  }

  async function resetBanner() {
    setBanner(props.banner);
    await updateServerHome(props.serverId, { banner: '' });
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Banner header (own home banner, falls back to the server banner) */}
      <div className="relative h-48 w-full overflow-hidden bg-secondary">
        {isGradient(banner) ? (
          <span className="absolute inset-0" style={{ backgroundImage: banner }} />
        ) : banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 bg-gradient-to-br from-link/30 to-link/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/5 to-transparent" />

        {/* Open the channel-list drawer (mobile only) */}
        <button
          type="button"
          onClick={openNavDrawer}
          aria-label={t('channelList')}
          className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        {props.canManage && (
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={() => bannerRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            >
              {bannerBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {t('homeBannerEdit')}
            </button>
            {props.homeBanner && (
              <button type="button" onClick={resetBanner} className="rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60">
                {t('removeImage')}
              </button>
            )}
            <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <div className="flex items-end gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent ring-4 ring-background">
              {props.icon
                ? <Image src={props.icon} alt={props.name} width={64} height={64} className="h-full w-full object-cover" />
                : <span className="text-2xl font-bold text-link">{props.name[0]?.toUpperCase()}</span>}
            </div>
            <div className="min-w-0">
              <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight">
                <span className="truncate">{props.name}</span>
                {props.isVerified && <ServerVerifiedBadge size="md" />}
              </h1>
              <p className="mt-0.5 flex items-center gap-3 text-[13px] font-medium text-muted-foreground">
                {online != null && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />{online} {t('online')}</span>}
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{props.memberCount} {t('membersWord')}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Widgets */}
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Leaderboard serverId={props.serverId} />
          <Whiteboard serverId={props.serverId} initial={props.homeWhiteboard} canManage={props.canManage} />
        </div>
        <div className="flex flex-col gap-4">
          <About serverId={props.serverId} description={props.description} canManage={props.canManage} />
        </div>
      </div>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          shape="rect"
          aspect={2.5}
          outputWidth={1600}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onApply={applyCrop}
        />
      )}
    </div>
  );
}

/* ── Leaderboard ── */
interface Row { profile_id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean; msg_count: number }
const PERIODS = [{ key: '7', days: 7 }, { key: '30', days: 30 }, { key: 'all', days: null }] as const;
const MEDAL = ['text-warning', 'text-muted-foreground', 'text-[#cd7f32]'];

function Leaderboard({ serverId }: { serverId: string }) {
  const t = useT('servers');
  const sbRef = useRef(createClient());
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (days: number | null) => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sbRef.current as any).rpc('get_server_leaderboard', { p_server: serverId, p_days: days });
    setRows(Array.isArray(data) ? data.map((r: Row) => ({ ...r, msg_count: Number(r.msg_count) || 0 })) : []);
    setLoading(false);
  }, [serverId]);

  useEffect(() => { load(period.days); }, [period, load]);

  return (
    <section className="overflow-hidden rounded-2xl bg-card/60 ring-1 ring-border/30">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold"><Trophy className="h-4 w-4 text-warning" /> {t('leaderboard')}</h2>
        <div className="flex rounded-lg bg-secondary/60 p-0.5 text-[12px] font-medium">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p)} className={cn('rounded-md px-2.5 py-1 transition-colors', period.key === p.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
              {p.key === 'all' ? t('lbAll') : `${p.key}${t('lbDay')}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-col">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 animate-skeleton rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 pb-5 pt-3 text-center text-[13px] text-muted-foreground">{t('lbEmpty')}</p>
        ) : rows.map((r, i) => {
          const name = r.display_name ?? r.username;
          return (
            <div key={r.profile_id} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/30">
              <span className={cn('w-5 shrink-0 text-center text-[14px] font-bold', i < 3 ? MEDAL[i] : 'text-muted-foreground/60')}>{i + 1}</span>
              <MiniProfilePopup user={{ username: r.username }} serverId={serverId} memberId={r.profile_id}>
                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-link/20">
                  {r.avatar_url
                    ? <AvatarImage src={r.avatar_url} alt={name} sizes="32px" className="object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{name[0]?.toUpperCase()}</span>}
                </div>
              </MiniProfilePopup>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold">{renderEmojiNodes(name)}</span>
                {r.is_verified && <VerifiedBadge size="sm" />}
                {i === 0 && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" />}
              </div>
              <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                <MessagesSquare className="h-3.5 w-3.5" />
                {r.msg_count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── About Us ── */
function About({ serverId, description, canManage }: { serverId: string; description: string | null; canManage: boolean }) {
  const t = useT('servers');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(description ?? '');
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(description ?? '');

  async function save() {
    setBusy(true);
    await updateServerSettings(serverId, { description: text.trim() });
    setBusy(false);
    setValue(text.trim());
    setEditing(false);
    window.dispatchEvent(new CustomEvent('servers:changed'));
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-card/60 ring-1 ring-border/30">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold"><Info className="h-4 w-4 text-link" /> {t('aboutUs')}</h2>
        {canManage && !editing && (
          <button type="button" onClick={() => { setText(value); setEditing(true); }} className="flex items-center gap-1 text-[12px] font-medium text-link hover:underline">
            <Pencil className="h-3.5 w-3.5" /> {t('edit')}
          </button>
        )}
      </div>
      <div className="px-4 pb-4">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={5} placeholder={t('aboutPlaceholder')} className="w-full resize-none rounded-lg bg-secondary/50 px-3 py-2 text-[14px] text-foreground outline-none ring-1 ring-transparent focus:ring-link/50" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>{t('cancel')}</Button>
              <Button size="sm" onClick={save} isLoading={busy}>{t('save')}</Button>
            </div>
          </div>
        ) : value.trim() ? (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/80">{value}</p>
        ) : (
          <p className="text-[13px] text-muted-foreground">{t('aboutEmpty')}</p>
        )}
      </div>
    </section>
  );
}

/* ── Whiteboard — shared for everyone, full drawing toolkit, global save ── */
const BOARD_COLORS = ['#7c5cff', '#ffffff', '#f04747', '#faa61a', '#43b581', '#3498db', '#e91e63', '#111318'];
const BOARD_SIZES = [3, 6, 12, 22];

function Whiteboard({ serverId, initial, canManage }: { serverId: string; initial: string | null; canManage: boolean }) {
  const t = useT('servers');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState<string>(BOARD_COLORS[0]!);
  const [size, setSize] = useState(6);
  const [eraser, setEraser] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);

  function togglePicker() {
    setEraser(false);
    if (picker) { setPicker(false); return; }
    const r = pickerBtnRef.current?.getBoundingClientRect();
    if (r) setPickerPos({ x: r.left, y: r.bottom + 6 });
    setPicker(true);
  }

  // Load the shared board image.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (initial) { const img = new window.Image(); img.crossOrigin = 'anonymous'; img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height); img.src = initial; }
  }, [initial]);

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function down(e: React.PointerEvent) {
    if (!canManage) return;
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke();
    setDirty(true);
  }
  function up() { drawing.current = false; }

  function clear() {
    const c = canvasRef.current; const ctx = c?.getContext('2d');
    if (c && ctx) { ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, c.width, c.height); setDirty(true); }
  }

  async function save() {
    const c = canvasRef.current; if (!c) return;
    setSaving(true);
    const blob: Blob | null = await new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
    if (blob) {
      const fd = new FormData();
      fd.append('file', new File([blob], 'whiteboard.png', { type: 'image/png' }));
      const res = await uploadServerHomeAsset(serverId, 'whiteboard', fd);
      if ('url' in res && res.url) {
        await updateServerHome(serverId, { whiteboard: res.url });
        setDirty(false);
        window.dispatchEvent(new CustomEvent('servers:changed'));
      }
    }
    setSaving(false);
  }

  return (
    <section className="rounded-2xl bg-card/60 ring-1 ring-border/30">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold"><Pencil className="h-4 w-4 text-link" /> {t('whiteboard')}</h2>
        {canManage && (
          <Button size="sm" onClick={save} isLoading={saving} disabled={!dirty}>{t('save')}</Button>
        )}
      </div>

      {/* Toolbar */}
      {canManage && (
        <div className="relative flex flex-wrap items-center gap-2 px-4 pb-2">
          {BOARD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); setEraser(false); }}
              className={cn('h-6 w-6 rounded-full ring-2 transition-transform hover:scale-110', !eraser && color === c ? 'ring-foreground' : 'ring-border/50')}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
          <button
            ref={pickerBtnRef}
            type="button"
            onClick={togglePicker}
            className={cn('flex h-6 w-6 items-center justify-center rounded-full ring-2', picker ? 'ring-foreground' : 'ring-border/50')}
            style={{ backgroundColor: color }}
            title={t('roleColorCustom')}
          >
            <Pencil className="h-3 w-3 text-white" />
          </button>

          <span className="mx-1 h-5 w-px bg-border/50" />

          {BOARD_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition-colors', size === s ? 'bg-accent' : 'hover:bg-accent/50')}
              aria-label={`${s}px`}
            >
              <span className="rounded-full bg-foreground" style={{ width: Math.min(s, 16), height: Math.min(s, 16) }} />
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-border/50" />

          <button type="button" onClick={() => setEraser((e) => !e)} className={cn('flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium transition-colors', eraser ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50')}>
            <Eraser className="h-3.5 w-3.5" /> {t('whiteboardEraser')}
          </button>
          <button type="button" onClick={clear} className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-destructive">
            {t('whiteboardClear')}
          </button>

          {picker && pickerPos && typeof document !== 'undefined' && createPortal(
            <>
              <div className="fixed inset-0 z-[70]" onClick={() => setPicker(false)} />
              <div className="fixed z-[71]" style={{ left: pickerPos.x, top: pickerPos.y }}>
                <ColorPicker value={color} onChange={setColor} />
              </div>
            </>,
            document.body,
          )}
        </div>
      )}

      <div className="px-4 pb-4">
        <canvas
          ref={canvasRef}
          width={900}
          height={380}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className={cn('h-[300px] w-full rounded-xl bg-secondary/40 ring-1 ring-border/40', canManage ? 'touch-none cursor-crosshair' : 'pointer-events-none')}
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground/60">{canManage ? t('whiteboardHintShared') : t('whiteboardReadonly')}</p>
      </div>
    </section>
  );
}
