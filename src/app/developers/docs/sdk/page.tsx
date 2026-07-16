import { DocTitle, Lead, H2, H3, P, UL, C, Callout, CodeBlock, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — SDK Reference' };

export default async function SdkPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('SDK Reference', 'Справочник SDK')}</DocTitle>
      <Lead>
        {tr(
          'The official prosto-bot TypeScript SDK wraps the REST API and the long-poll loop so you write handlers, not plumbing. Zero runtime dependencies.',
          'Официальный TypeScript-SDK prosto-bot оборачивает REST API и цикл длинного опроса, чтобы вы писали обработчики, а не инфраструктуру. Ноль рантайм-зависимостей.',
        )}
      </Lead>

      <H2>{tr('Install', 'Установка')}</H2>
      <CodeBlock
        samples={[
          { label: 'npm', language: 'bash', code: 'npm install prosto-bot' },
          { label: 'pnpm', language: 'bash', code: 'pnpm add prosto-bot' },
          { label: tr('From the repo', 'Из репозитория'), language: 'bash', code: `# ${tr('The SDK lives in packages/prosto-bot in the Prosto repo.', 'SDK лежит в packages/prosto-bot в репозитории Prosto.')}\n# ${tr('Copy it into your project or publish it to your own registry.', 'Скопируйте его в свой проект или опубликуйте в своём реестре.')}` },
        ]}
      />

      <H2>{tr('Create a bot', 'Создание бота')}</H2>
      <CodeBlock
        samples={[{
          label: 'TypeScript',
          language: 'ts',
          code: `import { ProstoBot } from 'prosto-bot';

const bot = new ProstoBot({
  token: process.env.PROSTO_BOT_TOKEN!,
  // baseUrl defaults to https://prosto.ink
});`,
        }]}
      />

      <H2>{tr('Register commands', 'Регистрация команд')}</H2>
      <P>{tr('Each command() defines a slash command and its handler. On start(), the SDK syncs them to Prosto.', 'Каждый command() описывает слэш-команду и её обработчик. При start() SDK синхронизирует их с Prosto.')}</P>
      <CodeBlock
        samples={[{
          label: 'TypeScript',
          language: 'ts',
          code: `bot.command('ping', 'Health check', (ctx) => ctx.reply('Pong 🏓'));

bot.command(
  'weather',
  'Get the weather',
  { options: [{ name: 'city', description: 'City name', type: 'string', required: true }] },
  async (ctx) => {
    const city = ctx.option('city');
    await ctx.reply(\`The weather in \${city} is sunny ☀️\`);
  },
);`,
        }]}
      />

      <H3>{tr('The context object', 'Объект контекста')}</H3>
      <UL>
        <li><C>ctx.command</C> — {tr('the command name.', 'имя команды.')}</li>
        <li><C>ctx.option(name)</C> — {tr('a submitted option value.', 'значение переданного параметра.')}</li>
        <li><C>ctx.options</C> — {tr('all options as an object.', 'все параметры как объект.')}</li>
        <li><C>ctx.invoker</C> — {tr('{ id, username } of the user who ran it.', '{ id, username } пользователя, вызвавшего команду.')}</li>
        <li><C>ctx.scope</C> — {tr('"channel" or "dm", plus ctx.channelId / ctx.conversationId.', '"channel" или "dm", а также ctx.channelId / ctx.conversationId.')}</li>
        <li><C>ctx.reply(text)</C> — {tr('answer the interaction (posts to where it was run).', 'ответить на взаимодействие (публикуется туда, где вызвано).')}</li>
      </UL>

      <H2>{tr('Start & stop', 'Запуск и остановка')}</H2>
      <CodeBlock
        samples={[{
          label: 'TypeScript',
          language: 'ts',
          code: `bot.start();          // ${tr('begins the long-poll loop', 'запускает цикл длинного опроса')}
// … ${tr('later', 'позже')} …
bot.stop();           // ${tr('stops polling gracefully', 'корректно останавливает опрос')}`,
        }]}
      />

      <H2>{tr('Send messages directly', 'Прямая отправка сообщений')}</H2>
      <CodeBlock
        samples={[{
          label: 'TypeScript',
          language: 'ts',
          code: `await bot.sendMessage({ channelId, content: 'Deploy finished ✅' });
await bot.sendMessage({ conversationId, content: 'Your reminder!' });`,
        }]}
      />

      <Callout>
        {tr(
          'The SDK retries transient network errors and honours 429 back-off automatically, so a simple start() loop is robust enough for production.',
          'SDK повторяет временные сетевые ошибки и автоматически учитывает задержку при 429, поэтому простого цикла start() достаточно для продакшена.',
        )}
      </Callout>

      <DocsPager slug="sdk" />
    </>
  );
}
