import { DocTitle, Lead, H2, P, UL, C, Callout, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Security' };

export default async function SecurityPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('Security', 'Безопасность')}</DocTitle>
      <Lead>{tr('How tokens are protected, and how to keep your bot safe.', 'Как защищены токены и как обезопасить своего бота.')}</Lead>

      <H2>{tr('How we store tokens', 'Как мы храним токены')}</H2>
      <UL>
        <li>{tr('We never store the token secret — only a SHA-256 hash of it.', 'Мы никогда не храним секрет токена — только его SHA-256 хеш.')}</li>
        <li>{tr("The hash is additionally peppered with a server-only secret, so even a database leak can't be turned into working tokens.", 'Хеш дополнительно «перчится» серверным секретом, поэтому даже утечка базы не даст рабочих токенов.')}</li>
        <li>{tr("Verification is constant-time, so tokens can't be guessed by timing.", 'Проверка выполняется за постоянное время, поэтому токен нельзя подобрать по времени ответа.')}</li>
        <li>{tr("The plaintext token exists only in the reveal dialog at creation — it's never logged or re-displayed.", 'Открытый токен существует только в окне при создании — он не логируется и не показывается повторно.')}</li>
      </UL>

      <Callout tone="danger">
        {tr(
          "Anyone with your token can act as your bot everywhere it's a member. If a token leaks, revoke it in the portal immediately and mint a new one.",
          'Любой, у кого есть ваш токен, может действовать от имени бота везде, где тот состоит. При утечке немедленно отзовите токен в портале и создайте новый.',
        )}
      </Callout>

      <H2>{tr("What a bot can and can't do", 'Что бот может и чего не может')}</H2>
      <UL>
        <li>{tr('A bot has no special powers. It acts within the same permissions as any member.', 'У бота нет особых привилегий. Он действует в рамках тех же прав, что и любой участник.')}</li>
        <li>{tr('It can only post in channels/DMs it belongs to, with send permission.', 'Он может писать только в каналах/личках, где состоит, и при наличии права отправки.')}</li>
        <li>{tr('Blocks, timeouts, and moderation apply to bots the same as to people.', 'Блокировки, тайм-ауты и модерация применяются к ботам так же, как к людям.')}</li>
        <li>{tr('Interactions only reach a bot when a user who can see it runs one of its commands.', 'Взаимодействия доходят до бота, только когда его команду вызывает пользователь, который его видит.')}</li>
      </UL>

      <H2>{tr('Keeping your bot safe', 'Как обезопасить бота')}</H2>
      <UL>
        <li>{tr('Store the token in an environment variable — never commit it to source control.', 'Храните токен в переменной окружения — не коммитьте его в систему контроля версий.')}</li>
        <li>{tr('Use a separate token per deployment so you can revoke one without downtime.', 'Используйте отдельный токен на каждое развёртывание, чтобы отзывать один без простоя.')}</li>
        <li>{tr('Validate and sanitize any user input from options before acting on it.', 'Проверяйте и очищайте любой пользовательский ввод из options, прежде чем действовать.')}</li>
        <li>{tr("Don't echo secrets or another user's private data back into a channel.", 'Не выводите секреты или чужие приватные данные обратно в канал.')}</li>
      </UL>

      <H2>{tr('Reporting a vulnerability', 'Сообщить об уязвимости')}</H2>
      <P>
        {tr('Found a security issue in the bot platform? Email ', 'Нашли проблему безопасности в платформе ботов? Напишите на ')}
        <C>security@prosto.ink</C>
        {tr(" with details. Please don't open a public issue.", ' с подробностями. Пожалуйста, не создавайте публичный issue.')}
      </P>

      <DocsPager slug="security" />
    </>
  );
}
