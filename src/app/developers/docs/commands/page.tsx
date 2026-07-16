import { DocTitle, Lead, H2, P, UL, C, Callout, CodeBlock, Endpoint, FieldTable, DocsPager, docsTr } from '@/features/developers';

export const metadata = { title: 'Bot API — Slash Commands' };

export default async function CommandsPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow={tr('Reference', 'Справочник')}>{tr('Slash Commands', 'Слэш-команды')}</DocTitle>
      <Lead>{tr('Slash commands are the only way users invoke a bot — clean, discoverable, no text prefixes.', 'Слэш-команды — единственный способ вызвать бота: наглядно, находимо, без текстовых префиксов.')}</Lead>

      <H2>{tr('Naming', 'Именование')}</H2>
      <UL>
        <li>{tr('Lowercase letters, digits, _ and -; must start with a letter.', 'Строчные буквы, цифры, _ и -; должно начинаться с буквы.')}</li>
        <li>{tr('1–32 characters. Examples: ping, weather, roll-dice.', '1–32 символа. Примеры: ping, weather, roll-dice.')}</li>
        <li>{tr('Names are unique per bot.', 'Имена уникальны в рамках одного бота.')}</li>
      </UL>

      <H2>{tr('Options', 'Параметры')}</H2>
      <P>{tr('A command can declare typed options, which the palette collects from the user before sending:', 'Команда может объявлять типизированные параметры, которые палитра собирает у пользователя перед отправкой:')}</P>
      <FieldTable
        rows={[
          { name: 'name', type: 'string', desc: tr('Option key (same naming rules as commands).', 'Ключ параметра (те же правила именования, что у команд).') },
          { name: 'description', type: 'string', desc: tr('Shown next to the input in the palette.', 'Показывается рядом с полем ввода в палитре.') },
          { name: 'type', type: '"string" | "integer" | "boolean" | "user"', desc: tr('How the value is collected and validated.', 'Как значение собирается и проверяется.') },
          { name: 'required', type: 'boolean', desc: tr('Whether the user must provide it.', 'Обязателен ли ввод.') },
        ]}
      />

      <H2>{tr('Registering commands from code', 'Регистрация команд из кода')}</H2>
      <Endpoint method="PUT" path="/api/v1/commands" />
      <P>
        {tr(
          "A declarative bulk sync — the array you send becomes the bot's complete command set. New commands are added, existing ones updated, and any omitted ones removed.",
          'Декларативная массовая синхронизация: присланный массив становится полным набором команд бота. Новые добавляются, существующие обновляются, отсутствующие удаляются.',
        )}
      </P>
      <CodeBlock
        samples={[{
          label: tr('Request', 'Запрос'),
          language: 'json',
          code: `{
  "commands": [
    { "name": "ping", "description": "Health check" },
    {
      "name": "weather",
      "description": "Get the weather",
      "options": [
        { "name": "city", "description": "City name", "type": "string", "required": true }
      ]
    }
  ]
}`,
        }]}
      />

      <Callout>
        {tr(
          'The SDK calls this for you on start(), based on the commands you registered with bot.command(…). You rarely need to call it by hand.',
          'SDK вызывает это за вас при start(), исходя из команд, зарегистрированных через bot.command(…). Вручную это почти никогда не нужно.',
        )}
      </Callout>

      <H2>{tr('Listing commands', 'Список команд')}</H2>
      <Endpoint method="GET" path="/api/v1/commands" />
      <P>{tr("Returns the bot's current commands. You can also manage them in the portal's Commands tab.", 'Возвращает текущие команды бота. Ими также можно управлять во вкладке «Commands» портала.')}</P>

      <H2>{tr('Examples with the SDK', 'Примеры с SDK')}</H2>
      <P>{tr(
        'With the SDK you declare commands in code — it syncs them on start() and dispatches each invocation to your handler. ctx.reply() posts the answer back to where the command was run.',
        'С SDK вы объявляете команды в коде — он синхронизирует их при start() и направляет каждый вызов в ваш обработчик. ctx.reply() отправляет ответ туда, где запустили команду.',
      )}</P>
      <CodeBlock
        samples={[{
          label: 'index.js',
          language: 'javascript',
          code: `import { ProstoBot } from 'prosto-bot';

const bot = new ProstoBot({ token: process.env.PROSTO_BOT_TOKEN });

// No options — just reply.
bot.command('ping', 'Health check', async (ctx) => {
  await ctx.reply('Pong 🏓');
});

// One required string option, read with ctx.option(name).
bot.command('echo', 'Repeat your message back',
  { options: [{ name: 'text', description: 'What to echo', type: 'string', required: true }] },
  async (ctx) => { await ctx.reply(ctx.option('text')); },
);

// An optional integer option (default when omitted).
bot.command('roll', 'Roll a die',
  { options: [{ name: 'sides', description: 'Sides (default 6)', type: 'integer', required: false }] },
  async (ctx) => {
    const sides = Number(ctx.option('sides')) || 6;
    await ctx.reply(\`🎲 \${1 + Math.floor(Math.random() * sides)} (d\${sides})\`);
  },
);

// Use the invoker's identity.
bot.command('hello', 'Say hi', async (ctx) => {
  await ctx.reply(\`Hi @\${ctx.invoker.username}! 👋\`);
});

bot.start();`,
        }]}
      />

      <H2>{tr('Option types', 'Типы параметров')}</H2>
      <P>{tr(
        'Option values always arrive as strings in ctx.option(name) — coerce them yourself (e.g. Number(ctx.option("sides"))). Types drive how the in-app palette collects and validates input:',
        'Значения параметров всегда приходят строками в ctx.option(name) — приводите их сами (например, Number(ctx.option("sides"))). Типы определяют, как палитра в приложении собирает и проверяет ввод:',
      )}</P>
      <FieldTable
        rows={[
          { name: 'string', type: 'text', desc: tr('Free text. Use for the LAST option if it may contain spaces.', 'Свободный текст. Ставьте ПОСЛЕДНИМ, если может содержать пробелы.') },
          { name: 'integer', type: 'number', desc: tr('Whole number; the palette rejects non-numeric input.', 'Целое число; палитра отклоняет нечисловой ввод.') },
          { name: 'boolean', type: 'true / false', desc: tr('A yes/no toggle.', 'Переключатель да/нет.') },
          { name: 'user', type: 'mention', desc: tr('A person picker; arrives as the selected value.', 'Выбор пользователя; приходит как выбранное значение.') },
        ]}
      />

      <Callout tone="danger">
        {tr(
          'Permission gotcha: a bot can only ANSWER a command where it can Send Messages. A freshly added bot inherits only @everyone. If your handler runs but reply() returns 403, give the bot a role with Send Messages in that channel. See Errors → "403 when replying".',
          'Важно про права: бот может ОТВЕТИТЬ на команду только там, где может «Отправлять сообщения». Свежедобавленный бот наследует только @everyone. Если обработчик запускается, но reply() возвращает 403 — выдайте боту роль с правом «Отправлять сообщения» в этом канале. См. Ошибки → «403 при ответе».',
        )}
      </Callout>

      <DocsPager slug="commands" />
    </>
  );
}
