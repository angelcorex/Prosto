-- ─────────────────────────────────────────────────────────────────────────
-- Framing (focal point + zoom) for profile avatar & banner. Lets an animated
-- GIF avatar/banner be positioned/zoomed like a cropped image WITHOUT losing
-- its animation: instead of re-encoding, we store a compact "x,y,scale" string
-- (x/y are object-position percentages, scale ≥ 1) and apply the identical CSS
-- at display. Null = default (centered, no zoom). Users set these on their own
-- row (allowed by the existing self-update policy; only is_verified/is_premium
-- are locked).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists avatar_pos text,
  add column if not exists banner_pos text;
