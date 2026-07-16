import { DocTitle, Lead, H2, P, OL, C, Callout, CodeBlock, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Quickstart' };

/** Zero-to-running /ping bot. */
export default async function QuickstartPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Guide', 'Руководство')}>{tr('Quickstart', 'Быстрый старт')}</DocTitle>
      <Lead>{tr('Get a working /ping bot replying in a server in about five minutes.', 'Запустите рабочего /ping-бота на сервере примерно за пять минут.')}</Lead>

      <H2>{tr('1. Create your bot', '1. Создайте бота')}</H2>
      <OL>
        <li>{tr('Open the ', 'Откройте ')}<a href="/developers" className="text-primary underline">{tr('developer portal', 'портал разработчиков')}</a>{tr(' and click New bot.', ' и нажмите «New bot».')}</li>
        <li>{tr('Give it a username (e.g. ping_bot) and a display name.', 'Задайте имя пользователя (напр. ping_bot) и отображаемое имя.')}</li>
        <li>{tr('Copy the token from the reveal dialog — it is shown once.', 'Скопируйте токен из окна — он показывается один раз.')}</li>
      </OL>

      <Callout tone="warn">
        {tr(
          'Treat the token like a password. Anyone with it can act as your bot. Store it in an environment variable, never in your source code or a public repo.',
          'Обращайтесь с токеном как с паролем. Любой, у кого он есть, может действовать от имени вашего бота. Храните его в переменной окружения, а не в коде или публичном репозитории.',
        )}
      </Callout>

      <H2>{tr('2. Add the bot to a server', '2. Добавьте бота на сервер')}</H2>
      <P>
        {tr(
          "In the bot's Servers tab, add it to a server you own. That's what lets members run its slash commands in that server's channels.",
          'Во вкладке бота «Servers» добавьте его на сервер, которым вы владеете. Именно это позволяет участникам вызывать его слэш-команды в каналах сервера.',
        )}
      </P>

      <H2>{tr('3. Register a command', '3. Зарегистрируйте команду')}</H2>
      <P>
        {tr(
          'In the Commands tab, add a command named ping. (You can also do this from code with the SDK — see step 4.)',
          'Во вкладке «Commands» добавьте команду ping. (Это также можно сделать из кода через SDK — см. шаг 4.)',
        )}
      </P>

      <H2>{tr('4. Run the bot', '4. Запустите бота')}</H2>
      <P>{tr('Install the SDK and write a few lines. The bot connects out and long-polls — no server or public URL required.', 'Установите SDK и напишите несколько строк. Бот сам подключается и опрашивает сервер — публичный URL не нужен.')}</P>
      <CodeBlock
        samples={[
          {
            label: 'TypeScript',
            language: 'ts',
            code: `import { ProstoBot } from 'prosto-bot';

const bot = new ProstoBot({ token: process.env.PROSTO_BOT_TOKEN! });

// ${tr("Declaratively sync the bot's slash commands on startup.", 'Декларативно синхронизируем слэш-команды бота при старте.')}
bot.command('ping', 'Check if the bot is alive', (ctx) => ctx.reply('Pong 🏓'));

bot.start();
console.log('Bot is listening for slash commands…');`,
          },
          {
            label: 'Node (JS)',
            language: 'js',
            code: `const { ProstoBot } = require('prosto-bot');

const bot = new ProstoBot({ token: process.env.PROSTO_BOT_TOKEN });

bot.command('ping', 'Check if the bot is alive', (ctx) => ctx.reply('Pong 🏓'));

bot.start();`,
          },
          {
            label: 'Raw HTTP (curl)',
            language: 'bash',
            code: `# ${tr('Long-poll for interactions (waits up to 25s for the next /command)', 'Длинный опрос взаимодействий (ждёт до 25с следующую /команду)')}
curl -s "https://prosto.ink/api/v1/interactions?wait=25" \\
  -H "Authorization: Bearer $PROSTO_BOT_TOKEN"

# ${tr('Reply to one, using the responseToken from the interaction above', 'Ответьте на неё, используя responseToken из взаимодействия выше')}
curl -s -X POST \\
  "https://prosto.ink/api/v1/interactions/<responseToken>/respond" \\
  -H "Authorization: Bearer $PROSTO_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Pong 🏓"}'`,
          },
        ]}
      />

      <H2>{tr('5. Try it', '5. Проверьте')}</H2>
      <P>
        {tr(
          'In any channel the bot is in, type / and pick ping from the palette. The bot replies Pong 🏓 in the channel. That’s a working bot.',
          'В любом канале, где есть бот, нажмите / и выберите ping из палитры. Бот ответит Pong 🏓 прямо в канале. Готово — бот работает.',
        )}
      </P>

      <DocsPager slug="quickstart" />
    </>
  );
}
