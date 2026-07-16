'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { Label, Button, EmojiInput, type EmojiInputHandle } from '@/components/ui';
import { UsernameField } from '@/features/auth/components/username-field';
import { displayNameLength, DISPLAY_NAME_MAX } from '@/lib/utils/display-name';
import { BirthDateField } from '@/features/age';
import { updateProfile, type ProfileFormState } from '../api/actions';
import { AvatarUpload, type ImageUploadHandle } from './avatar-upload';
import { DefaultAvatarPicker } from './default-avatar-picker';
import { BannerUpload } from './banner-upload';
import { ProfilePreview } from './profile-preview';

export interface EditProfileFormProps {
  initialUsername: string;
  initialDisplayName?: string | null;
  initialBio?: string | null;
  initialAvatarUrl?: string | null;
  initialBannerUrl?: string | null;
  initialAvatarPos?: string | null;
  initialBannerPos?: string | null;
  initialPronouns?: string | null;
  /** Write-once date of birth (null until set). */
  initialBirthDate?: string | null;
  /** Super Prosto subscriber — unlocks animated GIF avatar/banner. */
  isPremium?: boolean;
}

const emptyState: ProfileFormState = {};

export function EditProfileForm({
  initialUsername,
  initialDisplayName,
  initialBio,
  initialAvatarUrl,
  initialBannerUrl,
  initialAvatarPos,
  initialBannerPos,
  initialPronouns,
  initialBirthDate,
  isPremium,
}: EditProfileFormProps) {
  const t = useT('settings');
  const ta = useT('age');
  const [state, formAction, isPending] = useActionState(updateProfile, emptyState);

  const [avatarUrl,   setAvatarUrl]   = useState(initialAvatarUrl   ?? null);
  const [bannerUrl,   setBannerUrl]   = useState(initialBannerUrl   ?? null);
  const [avatarPos,   setAvatarPos]   = useState<string | null>(initialAvatarPos ?? null);
  const [bannerPos,   setBannerPos]   = useState<string | null>(initialBannerPos ?? null);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [bio,         setBio]         = useState(initialBio         ?? '');
  const [pronouns,    setPronouns]    = useState(initialPronouns    ?? '');

  const avatarRef = useRef<ImageUploadHandle>(null);
  const bannerRef = useRef<ImageUploadHandle>(null);

  const initial = initialUsername[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex flex-col gap-8 lg:flex-row">

      {/* ── Form ── */}
      <form action={formAction} className="flex min-w-0 flex-1 flex-col gap-6">

        {/* Avatar */}
        <div>
          <FieldLabel>{t('avatar')}</FieldLabel>
          <AvatarUpload
            ref={avatarRef}
            current={avatarUrl}
            currentPos={avatarPos}
            initial={initial}
            onUploaded={(url, pos) => { setAvatarUrl(url); setAvatarPos(pos ?? null); }}
            size="lg"
            isPremium={isPremium}
          />
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t('orChooseDefault')}</p>
          <DefaultAvatarPicker value={avatarUrl} onChange={(url) => { setAvatarUrl(url); setAvatarPos(null); }} size="sm" />
          <input type="hidden" name="avatar_url" value={avatarUrl ?? ''} />
          <input type="hidden" name="avatar_pos" value={avatarPos ?? ''} />
        </div>

        {/* Banner */}
        <div>
          <FieldLabel>{t('banner')}</FieldLabel>
          <BannerUpload ref={bannerRef} current={bannerUrl} currentPos={bannerPos} onUploaded={(url, pos) => { setBannerUrl(url); setBannerPos(pos ?? null); }} isPremium={isPremium} />
          <input type="hidden" name="banner_url" value={bannerUrl ?? ''} />
          <input type="hidden" name="banner_pos" value={bannerPos ?? ''} />
        </div>

        <div className="h-px bg-border/50" />

        {/* Display name — plain text (custom server emoji intentionally not
            supported here: they render as fragile <:name:id> tokens that break
            when the emoji is deleted). Unicode emoji still work as characters. */}
        <Field
          label={t('displayName')}
          hint={state.fieldErrors?.displayName ?? `${t('displayNameHint')} · ${displayNameLength(displayName)}/${DISPLAY_NAME_MAX}`}
          isError={Boolean(state.fieldErrors?.displayName) || displayNameLength(displayName) > DISPLAY_NAME_MAX}
        >
          <input
            type="text"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('displayNamePlaceholder')}
            aria-invalid={Boolean(state.fieldErrors?.displayName) || displayNameLength(displayName) > DISPLAY_NAME_MAX}
            className={INPUT_CLASS}
          />
        </Field>

        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <UsernameField
            error={state.fieldErrors?.username}
            defaultValue={initialUsername}
            currentUsername={initialUsername}
          />
          {!state.fieldErrors?.username && (
            <p className="text-xs text-muted-foreground">{t('usernameHint')}</p>
          )}
        </div>

        {/* Pronouns */}
        <Field
          label={t('pronouns')}
          hint={state.fieldErrors?.pronouns ?? t('pronounsHint')}
          isError={Boolean(state.fieldErrors?.pronouns)}
        >
          <EmojiField
            name="pronouns"
            singleLine
            value={pronouns}
            onChange={setPronouns}
            maxLength={40}
            placeholder={t('pronounsPlaceholder')}
            className={INPUT_CLASS}
            ariaInvalid={Boolean(state.fieldErrors?.pronouns)}
          />
        </Field>

        {/* Bio */}
        <Field
          label={t('bio')}
          hint={state.fieldErrors?.bio ?? t('bioHint')}
          isError={Boolean(state.fieldErrors?.bio)}
        >
          <EmojiField
            name="bio"
            value={bio}
            onChange={setBio}
            maxLength={200}
            placeholder={t('bioPlaceholder')}
            className={cn(TEXTAREA_CLASS, 'min-h-20')}
            ariaInvalid={Boolean(state.fieldErrors?.bio)}
          />
        </Field>

        {/* Date of birth — write-once (immutable once set) */}
        <Field label={ta('birthDateLabel')}>
          <BirthDateField initial={initialBirthDate ?? null} />
        </Field>

        {/* Feedback */}
        {state.message && !state.success && (
          <p className="text-sm text-destructive" role="alert">{state.message}</p>
        )}
        {state.success && (
          <div className="flex items-center gap-2 text-sm text-success" role="status">
            <CheckCircle className="h-4 w-4" />
            {state.message}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button type="submit" size="sm" isLoading={isPending} className="px-7">
            {t('save')}
          </Button>
        </div>
      </form>

      {/* ── Live preview ── */}
      <div className="hidden w-[320px] shrink-0 lg:block">
        <div className="sticky top-0">
          <FieldLabel>{t('preview')}</FieldLabel>
          <ProfilePreview
            username={initialUsername}
            displayName={displayName}
            bio={bio}
            pronouns={pronouns}
            avatarUrl={avatarUrl}
            bannerUrl={bannerUrl}
            avatarPos={avatarPos}
            bannerPos={bannerPos}
            onAvatarClick={(rect) => avatarRef.current?.open(rect)}
            onBannerClick={(rect) => bannerRef.current?.open(rect)}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */

// Shared styling so the rich (emoji-rendering) fields look like Input/Textarea.
const INPUT_CLASS =
  'min-h-11 w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-colors focus:border-ring';
const TEXTAREA_CLASS =
  'w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-ring';

/**
 * A profile field that renders custom emoji as inline chips while editing
 * (Discord-style) yet still submits with the form. The visible surface is the
 * contentEditable EmojiInput; a hidden input carries the serialized value
 * (text + `<a?:name:id>` tokens) so the server action receives it under `name`.
 */
function EmojiField({
  name, value, onChange, placeholder, singleLine, maxLength, className, ariaInvalid,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  singleLine?: boolean;
  maxLength?: number;
  className?: string;
  ariaInvalid?: boolean;
}) {
  const ref = useRef<EmojiInputHandle>(null);
  // Seed the editable surface once from the initial value; it's uncontrolled
  // afterwards (all later changes originate from user input via onChange).
  useEffect(() => {
    if (ref.current) ref.current.value = value ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <EmojiInput
        ref={ref}
        singleLine={singleLine}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        className={className}
        onInput={() => onChange(ref.current?.value ?? '')}
      />
      <input type="hidden" name={name} value={value ?? ''} />
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
      {children}
    </p>
  );
}

function Field({
  label, hint, isError, children,
}: {
  label: string; hint?: string; isError?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && (
        <p className={cn('text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
          {hint}
        </p>
      )}
    </div>
  );
}
