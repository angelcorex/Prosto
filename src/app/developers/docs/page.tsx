import Link from 'next/link';

import { DocTitle, Lead, H2, P, UL, C, Callout, DocsPager, docsTr } from '@/features/developers';
import { buttonClass } from '@/components/ui/button';

export const metadata = { title: 'Bot API — Introduction' };

/** Docs landing: what the platform is + a map of the guide. */
export default async function DocsIndexPage() {
  const tr = await docsTr();
  return (
    <>
      <DocTitle eyebrow="Prosto Bot API">{tr('Build bots for Prosto', 'Создавайте ботов для Prosto')}</DocTitle>
      <Lead>
        {tr(
          'A small, clean HTTP API for building bots that respond to slash commands in servers and DMs — the way Discord and Telegram bots work, but simpler. No text prefixes, no message scraping: pure /command interactions.',
          'Небольшой аккуратный HTTP API для ботов, отвечающих на слэш-команды на серверах и в личных сообщениях — как боты Discord и Telegram, но проще. Никаких текстовых префиксов и парсинга сообщений: только чистые /команды.',
        )}
      </Lead>

      <P>
        {tr(
          'A bot is a real account on Prosto with its own name and avatar. You create it in the developer portal, get a secret token, add it to your servers, and run a tiny program that listens for slash commands and replies. That program can run anywhere — your laptop, a Raspberry Pi, a cloud box — because it connects out to Prosto and polls for work. You never need a public URL or a domain.',
          'Бот — это настоящий аккаунт на Prosto со своим именем и аватаркой. Вы создаёте его в портале разработчиков, получаете секретный токен, добавляете на свои серверы и запускаете небольшую программу, которая слушает слэш-команды и отвечает на них. Эта программа может работать где угодно — на ноутбуке, Raspberry Pi, облачном сервере — потому что она сама подключается к Prosto и опрашивает задачи. Публичный URL или домен не нужны.',
        )}
      </P>

      <H2>{tr('How it works', 'Как это работает')}</H2>
      <UL>
        <li>{tr('Create a bot in the portal and copy its token (shown once).', 'Создайте бота в портале и скопируйте токен (показывается один раз).')}</li>
        <li>{tr('Register slash commands like /ping or /weather.', 'Зарегистрируйте слэш-команды, например /ping или /weather.')}</li>
        <li>{tr('Add the bot to a server you own (or open a DM with it).', 'Добавьте бота на свой сервер (или откройте с ним личный чат).')}</li>
        <li>{tr('Run your code: it long-polls for interactions and replies to each one.', 'Запустите свой код: он опрашивает взаимодействия и отвечает на каждое.')}</li>
      </UL>

      <Callout>
        {tr(
          "Everything a bot can do, a normal member could do too. A bot only posts where it's a member with permission to send messages — the same rules as a person.",
          'Бот умеет ровно то же, что и обычный участник. Он пишет только там, где он состоит и имеет право отправлять сообщения — те же правила, что и у человека.',
        )}
      </Callout>

      <H2>{tr('Next steps', 'Дальше')}</H2>
      <P>
        {tr('The ', 'Раздел ')}
        <Link href="/developers/docs/quickstart" className="text-primary underline">{tr('Quickstart', 'Быстрый старт')}</Link>
        {tr(' gets a working /ping bot running in a few minutes. Or jump straight to the ', ' поможет запустить рабочего /ping-бота за пару минут. Или сразу перейдите к ')}
        <Link href="/developers/docs/sdk" className="text-primary underline">{tr('SDK reference', 'справочнику SDK')}</Link>
        {tr(' if you prefer to read the API surface first.', ', если хотите сначала изучить сам API.')}
      </P>

      <div className="mt-6 flex gap-3">
        <Link href="/developers/docs/quickstart" className={buttonClass()}>{tr('Start the quickstart', 'Начать быстрый старт')}</Link>
        <Link href="/developers" className={buttonClass({ variant: 'outline' })}>{tr('Open the portal', 'Открыть портал')}</Link>
      </div>

      <DocsPager slug="" />
    </>
  );
}
