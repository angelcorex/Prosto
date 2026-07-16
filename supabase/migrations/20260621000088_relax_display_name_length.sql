-- ─────────────────────────────────────────────────────────────────────────
-- Display names may contain custom-emoji tokens (`<a?:name:id>`), whose raw
-- text is far longer than what the user sees: each emoji counts as 2 toward the
-- 30-char VISUAL limit (enforced app-side on both the client and the server
-- action via displayNameLength()). The old raw `char_length(display_name) <= 50`
-- CHECK rejected perfectly valid names with two or more emojis — the upsert
-- failed and surfaced as a generic "something went wrong" save error.
--
-- Raise the raw ceiling to a safe backstop (the real limit is the visual one,
-- validated before we ever write). This is plenty for a max-length name made of
-- ~15 emoji tokens, while still blocking multi-KB abuse via direct writes.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles drop constraint if exists display_name_length;
alter table public.profiles
  add constraint display_name_length check (char_length(display_name) <= 2000);
