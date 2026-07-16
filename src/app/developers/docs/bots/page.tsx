import { DocTitle, Lead, H2, P, UL, OL, C, Callout, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Bots & Tokens' };

export default async function BotsPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Concepts', 'Основы')}>{tr('Bots & Tokens', 'Боты и токены')}</DocTitle>
      <Lead>{tr("What a bot is, how it's created, and how its credentials work.", 'Что такое бот, как он создаётся и как устроены его учётные данные.')}</Lead>

      <H2>{tr('A bot is an account', 'Бот — это аккаунт')}</H2>
      <P>
        {tr(
          'When you create a bot, Prosto provisions a real account for it — with a username, display name and avatar. It shows up in member lists and message authorship with a BOT tag so people can tell it apart from a human. Because it’s a normal account, it obeys the same permissions and moderation rules as anyone else.',
          'Когда вы создаёте бота, Prosto заводит для него настоящий аккаунт — с именем пользователя, отображаемым именем и аватаркой. Он виден в списках участников и как автор сообщений с меткой BOT, чтобы его отличали от человека. Это обычный аккаунт, поэтому он подчиняется тем же правам и правилам модерации, что и все.',
        )}
      </P>

      <H2>{tr('Ownership', 'Владение')}</H2>
      <UL>
        <li>{tr('Each bot has exactly one owner — the user who created it.', 'У каждого бота ровно один владелец — пользователь, который его создал.')}</li>
        <li>{tr('Only the owner can manage the bot, its tokens, and its commands.', 'Только владелец может управлять ботом, его токенами и командами.')}</li>
        <li>{tr('Only the owner (or a server manager) can add the bot to a server.', 'Только владелец (или менеджер сервера) может добавить бота на сервер.')}</li>
      </UL>

      <H2>{tr('Tokens', 'Токены')}</H2>
      <P>{tr("A token is how your code proves it's the bot. You can have several per bot — for example one per environment (dev / prod).", 'Токен — это то, чем ваш код доказывает, что он и есть бот. У одного бота может быть несколько токенов — например по одному на окружение (dev / prod).')}</P>
      <OL>
        <li>{tr("Create a token in the portal's Tokens tab.", 'Создайте токен во вкладке «Tokens» портала.')}</li>
        <li>{tr('Copy it from the reveal dialog — it’s shown once and never again.', 'Скопируйте его из окна — он показывается один раз и больше никогда.')}</li>
        <li>{tr('Store it in an environment variable in your bot process.', 'Храните его в переменной окружения процесса бота.')}</li>
        <li>{tr('Revoke it anytime; revoked tokens stop working on the next request.', 'Отзывайте в любой момент; отозванные токены перестают работать со следующего запроса.')}</li>
      </OL>

      <Callout tone="warn">
        {tr(
          'Rotate instead of sharing. If you need a token in a new place, mint a new one rather than copying the old secret around. That way you can revoke exactly the one that leaks without taking everything down.',
          'Ротация вместо копирования. Нужен токен в новом месте — создайте новый, а не копируйте старый секрет. Тогда при утечке можно отозвать именно его, не ломая всё остальное.',
        )}
      </Callout>

      <H2>{tr('Disabling a bot', 'Отключение бота')}</H2>
      <P>
        {tr(
          'Toggling a bot inactive in the portal makes every API call return 403 bot_inactive and stops it receiving interactions — a fast kill switch that keeps the account and its history intact. Deleting the bot removes it and its account permanently.',
          'Переключение бота в неактивное состояние в портале заставляет любой запрос к API возвращать 403 bot_inactive и прекращает приём взаимодействий — быстрый «стоп-кран», сохраняющий аккаунт и историю. Удаление бота убирает его и его аккаунт навсегда.',
        )}
      </P>

      <DocsPager slug="bots" />
    </>
  );
}
