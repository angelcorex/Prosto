import { useT } from '@/providers/i18n-provider';
import { Input, Label, PasswordInput } from '@/components/ui';
import { PASSWORD_MIN_LENGTH, type FieldErrors } from '../validation';

export function CredentialsFields({ errors }: { errors?: FieldErrors }) {
  const t = useT('auth.fields');
  const te = useT('auth.errors');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          aria-invalid={Boolean(errors?.email)}
        />
        {errors?.email ? (
          <p className="text-xs text-destructive" role="alert">
            {te(errors.email, { min: PASSWORD_MIN_LENGTH })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t('password')}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder={t('passwordPlaceholder', { min: PASSWORD_MIN_LENGTH })}
          aria-invalid={Boolean(errors?.password)}
        />
        {errors?.password ? (
          <p className="text-xs text-destructive" role="alert">
            {te(errors.password, { min: PASSWORD_MIN_LENGTH })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
