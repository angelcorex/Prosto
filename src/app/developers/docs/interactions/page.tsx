import { DocTitle, Lead, H2, P, UL, C, Callout, CodeBlock, Endpoint, FieldTable, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Interactions' };

export default async function InteractionsPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('Interactions', 'Взаимодействия')}</DocTitle>
      <Lead>{tr('An interaction is one slash-command invocation. Your bot polls for them, then replies.', 'Взаимодействие — это один вызов слэш-команды. Ваш бот опрашивает их, затем отвечает.')}</Lead>

      <H2>{tr('The lifecycle', 'Жизненный цикл')}</H2>
      <UL>
        <li>{tr('A user runs /command in a channel or DM → an interaction is queued for the bot.', 'Пользователь вызывает /команду в канале или личке → взаимодействие ставится в очередь бота.')}</li>
        <li>{tr('Your bot long-polls and receives the interaction (it’s marked delivered).', 'Бот опрашивает и получает взаимодействие (оно помечается delivered).')}</li>
        <li>{tr("Your bot replies via the interaction's single-use responseToken.", 'Бот отвечает через одноразовый responseToken взаимодействия.')}</li>
        <li>{tr('Unanswered interactions expire after 15 minutes.', 'Неотвеченные взаимодействия истекают через 15 минут.')}</li>
      </UL>

      <H2>{tr('Long-polling for interactions', 'Длинный опрос взаимодействий')}</H2>
      <Endpoint method="GET" path="/api/v1/interactions?wait=25&limit=10" />
      <P>
        {tr(
          'Returns any pending interactions immediately. If none are pending and you pass wait (0–30 seconds), the request holds open until one arrives or the timeout elapses, then returns — possibly empty. Loop this call forever.',
          'Сразу возвращает все ожидающие взаимодействия. Если их нет и вы передали wait (0–30 секунд), запрос держится открытым, пока не придёт взаимодействие или не истечёт таймаут, затем возвращает — возможно, пустой ответ. Зациклите этот вызов.',
        )}
      </P>
      <FieldTable
        rows={[
          { name: 'wait', type: 'int (0–30)', desc: tr('Seconds to hold the connection waiting for work.', 'Секунды удержания соединения в ожидании задач.') },
          { name: 'limit', type: 'int (1–50)', desc: tr('Max interactions to return in one batch.', 'Макс. число взаимодействий в одной выдаче.') },
        ]}
      />
      <CodeBlock
        samples={[{
          label: tr('Response', 'Ответ'),
          language: 'json',
          code: `{
  "ok": true,
  "interactions": [
    {
      "id": "…",
      "command": "weather",
      "responseToken": "b6f1…-single-use",
      "scope": "channel",
      "channelId": "…",
      "conversationId": null,
      "serverId": "…",
      "options": { "city": "Paris" },
      "invoker": { "id": "…", "username": "alice" },
      "createdAt": "2026-07-13T12:00:00Z"
    }
  ]
}`,
        }]}
      />

      <Callout>
        {tr(
          "Each interaction is handed to exactly one poll (claimed with a row lock), so two instances of your bot won't both process the same command.",
          'Каждое взаимодействие выдаётся ровно одному опросу (захватывается блокировкой строки), поэтому два экземпляра бота не обработают одну команду дважды.',
        )}
      </Callout>

      <H2>{tr('Replying to an interaction', 'Ответ на взаимодействие')}</H2>
      <Endpoint method="POST" path="/api/v1/interactions/:responseToken/respond" />
      <P>
        {tr(
          'Posts your reply to the originating channel or DM as the bot, and closes the interaction. The responseToken is single-use: a second reply returns 409 already_responded.',
          'Публикует ваш ответ в исходный канал или личку от имени бота и закрывает взаимодействие. responseToken одноразовый: повторный ответ вернёт 409 already_responded.',
        )}
      </P>
      <CodeBlock samples={[{ label: tr('Request', 'Запрос'), language: 'json', code: `{ "content": "It's sunny in Paris ☀️" }` }]} />

      <DocsPager slug="interactions" />
    </>
  );
}
