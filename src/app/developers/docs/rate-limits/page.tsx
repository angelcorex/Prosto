import { DocTitle, Lead, H2, P, UL, C, Callout, CodeBlock, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Rate Limits' };

export default async function RateLimitsPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('Rate Limits', 'Лимиты запросов')}</DocTitle>
      <Lead>{tr("Bots are rate-limited to keep the platform healthy. Handle 429 and you'll never notice them.", 'Боты ограничены по частоте запросов ради стабильности платформы. Обрабатывайте 429 — и вы их не заметите.')}</Lead>

      <H2>{tr('The limits', 'Лимиты')}</H2>
      <UL>
        <li>{tr('API requests: up to 120 requests per 10 seconds per bot.', 'Запросы к API: до 120 запросов за 10 секунд на бота.')}</li>
        <li>{tr('Messages: up to 20 messages per 10 seconds per bot.', 'Сообщения: до 20 сообщений за 10 секунд на бота.')}</li>
      </UL>
      <P>
        {tr(
          'The long-poll endpoint is cheap and mostly idle, so a normal listen-and-reply loop stays well under these. The limits exist to stop a runaway bot, not throttle real use.',
          'Эндпоинт длинного опроса дешёвый и почти всё время простаивает, поэтому обычный цикл «слушать-отвечать» держится намного ниже лимитов. Они нужны, чтобы остановить взбесившегося бота, а не мешать нормальной работе.',
        )}
      </P>

      <H2>{tr('When you hit a limit', 'Когда упёрлись в лимит')}</H2>
      <P>{tr('The API returns 429 with a Retry-After header (seconds):', 'API возвращает 429 с заголовком Retry-After (в секундах):')}</P>
      <CodeBlock
        samples={[{
          label: tr('Response', 'Ответ'),
          language: 'http',
          code: `HTTP/1.1 429 Too Many Requests
Retry-After: 10
Content-Type: application/json

{ "ok": false, "error": "rate_limited" }`,
        }]}
      />

      <Callout>
        {tr(
          'The SDK reads Retry-After and pauses automatically. If you call the API directly, wait that many seconds before retrying.',
          'SDK читает Retry-After и делает паузу автоматически. Если обращаетесь к API напрямую — подождите указанное число секунд перед повтором.',
        )}
      </Callout>

      <H2>{tr('Best practices', 'Рекомендации')}</H2>
      <UL>
        <li>{tr('Use one long-poll loop, not many parallel polls.', 'Используйте один цикл длинного опроса, а не много параллельных.')}</li>
        <li>{tr("Reply once per interaction — don't retry a successful reply.", 'Отвечайте один раз на взаимодействие — не повторяйте успешный ответ.')}</li>
        <li>{tr('Batch related output into a single message when you can.', 'По возможности объединяйте связанный вывод в одно сообщение.')}</li>
      </UL>

      <DocsPager slug="rate-limits" />
    </>
  );
}
