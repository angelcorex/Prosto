import { getT } from '@/lib/i18n';

export default async function MessagesPage() {
  const t = await getT('messages');

  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold">{t('selectConversation')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('selectConversationHint')}</p>
      </div>
    </div>
  );
}
