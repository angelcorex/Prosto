import { DocTitle, Lead, H2, P, UL, C, Callout, CodeBlock, Endpoint, FieldTable, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Sending Messages' };

export default async function MessagesPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('Sending Messages', 'Отправка сообщений')}</DocTitle>
      <Lead>{tr('Beyond replying to interactions, a bot can post messages directly to channels and DMs it belongs to.', 'Помимо ответов на взаимодействия, бот может отправлять сообщения напрямую в каналы и личные чаты, где он состоит.')}</Lead>

      <H2>{tr('Send a message', 'Отправка сообщения')}</H2>
      <Endpoint method="POST" path="/api/v1/messages" />
      <P>{tr('Provide exactly one target — a channelId or a conversationId.', 'Укажите ровно одну цель — channelId или conversationId.')}</P>
      <FieldTable
        rows={[
          { name: 'channelId', type: 'string?', desc: tr('Target server channel. Mutually exclusive with conversationId.', 'Целевой канал сервера. Взаимоисключающе с conversationId.') },
          { name: 'conversationId', type: 'string?', desc: tr('Target DM/group conversation.', 'Целевой личный/групповой чат.') },
          { name: 'content', type: 'string', desc: tr('Message text (1–4000 chars).', 'Текст сообщения (1–4000 символов).') },
          { name: 'replyTo', type: 'string?', desc: tr('Message id to reply to (optional).', 'ID сообщения для ответа (необязательно).') },
        ]}
      />
      <CodeBlock
        samples={[
          {
            label: tr('Channel', 'Канал'),
            language: 'bash',
            code: `curl -X POST https://prosto.ink/api/v1/messages \\
  -H "Authorization: Bearer $PROSTO_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":"<channel-id>","content":"Hello, channel!"}'`,
          },
          {
            label: 'DM',
            language: 'bash',
            code: `curl -X POST https://prosto.ink/api/v1/messages \\
  -H "Authorization: Bearer $PROSTO_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"conversationId":"<conversation-id>","content":"Hi there!"}'`,
          },
        ]}
      />

      <Callout>
        {tr(
          "A bot may only post where it's a member with permission to send messages. If it isn't, the call returns 403 forbidden — exactly what a person would hit.",
          'Бот может писать только там, где он состоит и имеет право отправлять сообщения. Иначе запрос вернёт 403 forbidden — ровно как у человека.',
        )}
      </Callout>

      <H2>{tr('Where do IDs come from?', 'Откуда брать ID?')}</H2>
      <UL>
        <li>{tr('Interactions carry channelId / conversationId — the easiest source.', 'Взаимодействия содержат channelId / conversationId — самый простой источник.')}</li>
        <li>{tr('The bot receives an interaction whenever a user runs one of its commands.', 'Бот получает взаимодействие каждый раз, когда пользователь вызывает одну из его команд.')}</li>
      </UL>

      <H2>{tr('Limits', 'Ограничения')}</H2>
      <UL>
        <li>{tr('Messages are 1–4000 characters.', 'Сообщения — 1–4000 символов.')}</li>
        <li>{tr('Bots are text-only for now (no file uploads via the API).', 'Пока боты только текстовые (загрузка файлов через API недоступна).')}</li>
        <li>{tr('Sends are rate-limited per bot — see ', 'Отправки ограничены по частоте для каждого бота — см. ')}<a href="/developers/docs/rate-limits" className="text-primary underline">{tr('Rate limits', 'Лимиты запросов')}</a>.</li>
      </UL>

      <DocsPager slug="messages" />
    </>
  );
}
