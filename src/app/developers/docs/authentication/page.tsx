import { DocTitle, Lead, H2, P, UL, C, Callout, CodeBlock, Endpoint, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Authentication' };

export default async function AuthenticationPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('Authentication', 'Аутентификация')}</DocTitle>
      <Lead>{tr("Every API request authenticates with your bot's token as a Bearer credential.", 'Каждый запрос к API аутентифицируется токеном бота через заголовок Bearer.')}</Lead>

      <H2>{tr('The token', 'Токен')}</H2>
      <P>{tr('A bot token looks like this:', 'Токен бота выглядит так:')}</P>
      <CodeBlock samples={[{ label: tr('Token format', 'Формат токена'), language: 'text', code: 'pb_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.xY7kQ2… (secret)' }]} />
      <UL>
        <li>{tr("The part before the dot identifies the token (an id) — it's how we look it up quickly.", 'Часть до точки идентифицирует токен (id) — по ней мы быстро находим его.')}</li>
        <li>{tr('The part after the dot is the secret. We only ever store a hash of it.', 'Часть после точки — секрет. Мы храним только его хеш.')}</li>
      </UL>

      <Callout tone="danger">
        {tr(
          'Because only a hash is stored, a token cannot be recovered or re-displayed. If you lose it, create a new one and revoke the old one in the portal. If a token leaks, revoke it immediately — revocation takes effect on the next request.',
          'Поскольку хранится только хеш, токен нельзя восстановить или показать повторно. Потеряли — создайте новый и отзовите старый в портале. Если токен утёк — отзовите немедленно; отзыв срабатывает со следующего запроса.',
        )}
      </Callout>

      <H2>{tr('Sending the token', 'Передача токена')}</H2>
      <P>{tr('Put it in the Authorization header on every request:', 'Указывайте его в заголовке Authorization в каждом запросе:')}</P>
      <CodeBlock
        samples={[{
          label: 'HTTP',
          language: 'http',
          code: `GET /api/v1/me HTTP/1.1
Host: prosto.ink
Authorization: Bearer pb_1a2b3c….xY7kQ2…`,
        }]}
      />

      <H2>{tr('Verify your token', 'Проверка токена')}</H2>
      <Endpoint method="GET" path="/api/v1/me" />
      <P>{tr("Returns the authenticated bot's identity — a good startup health check.", 'Возвращает данные аутентифицированного бота — удобная проверка при старте.')}</P>
      <CodeBlock
        samples={[{
          label: tr('Response', 'Ответ'),
          language: 'json',
          code: `{
  "ok": true,
  "bot": {
    "id": "…",
    "username": "ping_bot",
    "displayName": "Ping Bot",
    "avatarUrl": null
  }
}`,
        }]}
      />

      <H2>{tr('Failure responses', 'Ошибки')}</H2>
      <UL>
        <li><C>401 missing_token</C> — {tr('no Authorization: Bearer header.', 'нет заголовка Authorization: Bearer.')}</li>
        <li><C>401 invalid_token</C> — {tr('malformed, unknown, revoked, or wrong secret.', 'некорректный, неизвестный, отозванный или неверный секрет.')}</li>
        <li><C>403 bot_inactive</C> — {tr('the bot has been disabled in the portal.', 'бот отключён в портале.')}</li>
        <li><C>429 rate_limited</C> — {tr('too many requests; back off and retry.', 'слишком много запросов; сделайте паузу и повторите.')}</li>
      </UL>

      <DocsPager slug="authentication" />
    </>
  );
}
