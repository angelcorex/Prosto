import { DocTitle, Lead, H2, P, C, Callout, CodeBlock, FieldTable, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Errors' };

export default async function ErrorsPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('Errors', 'Ошибки')}</DocTitle>
      <Lead>{tr('Every error is JSON with a stable machine-readable code and a matching HTTP status.', 'Каждая ошибка — это JSON со стабильным машиночитаемым кодом и соответствующим HTTP-статусом.')}</Lead>

      <H2>{tr('Error shape', 'Формат ошибки')}</H2>
      <CodeBlock samples={[{ label: tr('Response', 'Ответ'), language: 'json', code: `{ "ok": false, "error": "forbidden" }` }]} />
      <P>{tr('Success responses always include "ok": true; errors always include "ok": false and an error code.', 'Успешные ответы всегда содержат "ok": true; ошибки — всегда "ok": false и код error.')}</P>

      <H2>{tr('Codes', 'Коды')}</H2>
      <FieldTable
        rows={[
          { name: 'missing_token', type: '401', desc: tr('No Authorization: Bearer header.', 'Нет заголовка Authorization: Bearer.') },
          { name: 'invalid_token', type: '401', desc: tr('Malformed, unknown, revoked, or wrong secret.', 'Некорректный, неизвестный, отозванный или неверный секрет.') },
          { name: 'bot_inactive', type: '403', desc: tr('The bot is disabled in the portal.', 'Бот отключён в портале.') },
          { name: 'forbidden', type: '403', desc: tr("The bot isn't a member / lacks permission for the target.", 'Бот не состоит там / не имеет прав для этой цели.') },
          { name: 'not_a_participant', type: '403', desc: tr("The bot isn't in that conversation.", 'Бот не участник этого чата.') },
          { name: 'content_required', type: '400', desc: tr('Empty message content.', 'Пустой текст сообщения.') },
          { name: 'content_too_long', type: '400', desc: tr('Content exceeds 4000 characters.', 'Текст превышает 4000 символов.') },
          { name: 'target_required', type: '400', desc: tr('Provide exactly one of channelId / conversationId.', 'Укажите ровно один из channelId / conversationId.') },
          { name: 'unknown_interaction', type: '404', desc: tr("The response token doesn't match a live interaction.", 'Токен ответа не соответствует активному взаимодействию.') },
          { name: 'already_responded', type: '409', desc: tr('This interaction was already answered.', 'На это взаимодействие уже ответили.') },
          { name: 'interaction_expired', type: '410', desc: tr('The interaction passed its 15-minute deadline.', 'Взаимодействие превысило срок в 15 минут.') },
          { name: 'rate_limited', type: '429', desc: tr('Too many requests; honour Retry-After.', 'Слишком много запросов; учитывайте Retry-After.') },
        ]}
      />

      <H2>{tr('Handling errors', 'Обработка ошибок')}</H2>
      <P>
        {tr(
          'Branch on the error code, not the message text. Retry 429 after Retry-After; treat 4xx other than 429 as a bug in your request; retry 5xx with backoff.',
          'Ветвитесь по коду error, а не по тексту сообщения. Повторяйте 429 после Retry-After; 4xx кроме 429 считайте ошибкой в своём запросе; 5xx повторяйте с задержкой.',
        )}
      </P>

      <H2>{tr('Most common gotcha: 403 when replying', 'Частая проблема: 403 при ответе')}</H2>
      <Callout tone="danger">
        {tr(
          'If your command handler runs but reply() / POST /interactions/:token/respond fails with 403 forbidden, the bot lacks the "Send Messages" permission where the command was used. The command reaches your bot (anyone who can send there may run it), but the bot can only post back if it can send there too.',
          'Если обработчик команды запускается, но reply() / POST /interactions/:token/respond падает с 403 forbidden — у бота нет права «Отправлять сообщения» там, где вызвали команду. Команда доходит до бота (её может запустить любой, кто может писать в этом месте), но бот отвечает только если сам может там писать.',
        )}
      </Callout>
      <P><b>{tr('Fix (channel):', 'Как починить (канал):')}</b> {tr(
        'Open the server, give the bot a role (or adjust the channel/@everyone override) that grants Send Messages in that channel. A freshly added bot only inherits @everyone — if @everyone can\'t send there, neither can the bot.',
        'Откройте сервер и выдайте боту роль (или настройте override канала/@everyone) с правом «Отправлять сообщения» в этом канале. Свежедобавленный бот наследует только @everyone — если @everyone не может писать там, бот тоже не сможет.',
      )}</P>
      <P><b>{tr('Fix (DM):', 'Как починить (ЛС):')}</b> {tr(
        'The bot must be a participant of the conversation. That happens automatically when a user opens a DM and runs a command; you don\'t need to do anything.',
        'Бот должен быть участником беседы. Это происходит автоматически, когда пользователь открывает ЛС и запускает команду; ничего делать не нужно.',
      )}</P>
      <P>{tr(
        'In the app, running a command the bot can\'t answer now shows the user an inline notice instead of silently failing — but fixing the permission is what makes the bot reply.',
        'В приложении запуск команды, на которую бот не может ответить, теперь показывает пользователю подсказку, а не молча падает — но чтобы бот отвечал, нужно выдать право.',
      )}</P>

      <DocsPager slug="errors" />
    </>
  );
}
