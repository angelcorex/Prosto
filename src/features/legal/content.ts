/**
 * Legal document content.
 *
 * Plain structured data (title + intro + sections) for each document, in both
 * supported locales. Rendered by `LegalDocument` so all legal pages share one
 * consistent layout and typography. Edit the copy here; the pages stay thin.
 *
 * This is a good-faith, plain-language set of policies for an MVP social
 * platform — not a substitute for review by a qualified lawyer before launch.
 */

export type LegalSlug = 'terms' | 'privacy' | 'guidelines';
type Locale = 'en' | 'ru';

export interface LegalSection {
  heading: string;
  /** Each entry is a paragraph. */
  body: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** Last meaningful revision date, shown on every document. */
export const LEGAL_UPDATED = '2026-06-27';

export const legalDocs: Record<LegalSlug, Record<Locale, LegalDoc>> = {
  terms: {
    en: {
      title: 'Terms of Service',
      intro:
        'The name Prosto comes from the Slavic word "prosto" (просто in Russian, and also used in Polish, Ukrainian and other Slavic languages), meaning "simply" or "just" — which is exactly how the platform is meant to feel. These Terms govern your access to and use of Prosto. By creating an account or using the platform, you agree to these Terms. If you do not agree, do not use Prosto.',
      sections: [
        {
          heading: '1. Eligibility',
          body: [
            'You must be at least 13 years old to use Prosto, and old enough to form a binding contract in your country. If you are under the age of majority where you live, you may only use Prosto with the involvement of a parent or guardian.',
            'By using Prosto you confirm that you meet these requirements and that the information you provide during registration is accurate.',
          ],
        },
        {
          heading: '2. Your account',
          body: [
            'You are responsible for your account, for keeping your password secure, and for all activity that happens under it. Choose a strong password and do not share it.',
            'Notify us promptly if you believe your account has been accessed without your permission. We are not liable for losses caused by unauthorized use of your account.',
          ],
        },
        {
          heading: '3. Your content',
          body: [
            'You keep ownership of the content you post — your posts, comments, messages, profile information, and media. You are solely responsible for what you publish.',
            'To run the service, you grant Prosto a non-exclusive, worldwide, royalty-free license to host, store, reproduce, and display your content for the purpose of operating and improving the platform. This license ends when you delete the content or your account, except where the content has already been shared with others or where we must retain it to comply with the law.',
          ],
        },
        {
          heading: '4. Acceptable use',
          body: [
            'Your use of Prosto must follow our Community Guidelines. Do not use the platform for anything illegal, harmful, deceptive, or abusive, and do not interfere with its security or normal operation.',
            'We may remove content or restrict accounts that violate these Terms or the Community Guidelines.',
          ],
        },
        {
          heading: '5. Intellectual property',
          body: [
            'Prosto, its name, logo, design, and software are owned by us and protected by intellectual property laws. These Terms do not grant you any right to use our branding without permission.',
          ],
        },
        {
          heading: '6. Termination',
          body: [
            'You may stop using Prosto and delete your account at any time from your settings. We may suspend or terminate access if you violate these Terms, if required by law, or to protect the platform and its users.',
            'Sections that by their nature should survive termination (such as content licenses already granted to other users, disclaimers, and limitations of liability) remain in effect.',
          ],
        },
        {
          heading: '7. Disclaimers',
          body: [
            'Prosto is provided "as is" and "as available", without warranties of any kind, whether express or implied. We do not guarantee that the service will be uninterrupted, error-free, or secure, or that content posted by users is accurate or lawful.',
          ],
        },
        {
          heading: '8. Limitation of liability',
          body: [
            'To the maximum extent permitted by law, Prosto and its operators are not liable for any indirect, incidental, or consequential damages, or for loss of data, profits, or goodwill, arising from your use of (or inability to use) the platform.',
          ],
        },
        {
          heading: '9. Changes to these Terms',
          body: [
            'We may update these Terms from time to time. When we make material changes, we will update the date above and, where appropriate, notify you. Continued use of Prosto after changes take effect means you accept the revised Terms.',
          ],
        },
        {
          heading: '10. Third-party connections',
          body: [
            'Prosto lets you optionally connect third-party services (for example, linking a music account to show what you are listening to). When you connect a service, that provider\u2019s own terms and privacy policy also apply, and we only access what you authorize. You can disconnect a linked service at any time from your settings.',
          ],
        },
        {
          heading: '11. Feedback',
          body: [
            'If you send us ideas, suggestions, or feedback about Prosto, we may use them to improve the platform without any obligation or compensation to you.',
          ],
        },
        {
          heading: '12. General',
          body: [
            'These Terms, together with our Privacy Policy and Community Guidelines, make up the entire agreement between you and Prosto regarding the platform.',
            'If any part of these Terms is found unenforceable, the rest stays in effect. Our not enforcing a provision is not a waiver of our right to do so later.',
          ],
        },
        {
          heading: '13. Contact',
          body: [
            'Questions about these Terms can be sent to support@justprosto.xyz.',
          ],
        },
      ],
    },
    ru: {
      title: 'Условия использования',
      intro:
        'Название Prosto происходит от славянского слова «просто» (в русском, а также в польском, украинском и других славянских языках), что означает «просто» или «just» — именно таким и задуман сервис. Эти Условия регулируют доступ к Prosto и его использование. Создавая аккаунт или используя платформу, вы соглашаетесь с этими Условиями. Если вы не согласны — не используйте Prosto.',
      sections: [
        {
          heading: '1. Право на использование',
          body: [
            'Вам должно быть не менее 13 лет, и вы должны быть достаточно взрослыми, чтобы заключать обязывающий договор в вашей стране. Если вы не достигли совершеннолетия по месту проживания, использовать Prosto можно только при участии родителя или законного представителя.',
            'Используя Prosto, вы подтверждаете, что соответствуете этим требованиям и что данные, указанные при регистрации, достоверны.',
          ],
        },
        {
          heading: '2. Ваш аккаунт',
          body: [
            'Вы отвечаете за свой аккаунт, за сохранность пароля и за все действия, совершённые под вашим аккаунтом. Используйте надёжный пароль и не передавайте его другим.',
            'Сообщите нам как можно скорее, если считаете, что доступ к вашему аккаунту получили без вашего согласия. Мы не несём ответственности за убытки, вызванные несанкционированным использованием вашего аккаунта.',
          ],
        },
        {
          heading: '3. Ваш контент',
          body: [
            'Вы сохраняете права на размещённый контент — посты, комментарии, сообщения, данные профиля и медиа. Вы несёте полную ответственность за то, что публикуете.',
            'Для работы сервиса вы предоставляете Prosto неисключительную, всемирную, безвозмездную лицензию на размещение, хранение, воспроизведение и отображение вашего контента в целях работы и улучшения платформы. Эта лицензия прекращается при удалении вами контента или аккаунта, за исключением случаев, когда контент уже был передан другим пользователям или когда мы обязаны хранить его в соответствии с законом.',
          ],
        },
        {
          heading: '4. Допустимое использование',
          body: [
            'Использование Prosto должно соответствовать нашим Правилам сообщества. Не используйте платформу для незаконных, вредоносных, вводящих в заблуждение или оскорбительных действий и не вмешивайтесь в её безопасность и нормальную работу.',
            'Мы можем удалять контент или ограничивать аккаунты, нарушающие эти Условия или Правила сообщества.',
          ],
        },
        {
          heading: '5. Интеллектуальная собственность',
          body: [
            'Prosto, название, логотип, дизайн и программное обеспечение принадлежат нам и защищены законами об интеллектуальной собственности. Эти Условия не дают вам права использовать наш бренд без разрешения.',
          ],
        },
        {
          heading: '6. Прекращение использования',
          body: [
            'Вы можете в любой момент прекратить использование Prosto и удалить аккаунт в настройках. Мы можем приостановить или прекратить доступ при нарушении этих Условий, по требованию закона или для защиты платформы и её пользователей.',
            'Положения, которые по своей природе должны действовать и после прекращения (например, уже предоставленные другим пользователям лицензии на контент, оговорки и ограничения ответственности), сохраняют силу.',
          ],
        },
        {
          heading: '7. Отказ от гарантий',
          body: [
            'Prosto предоставляется «как есть» и «по мере доступности», без каких-либо гарантий, явных или подразумеваемых. Мы не гарантируем бесперебойную, безошибочную или безопасную работу сервиса, а также достоверность или законность контента, размещённого пользователями.',
          ],
        },
        {
          heading: '8. Ограничение ответственности',
          body: [
            'В максимально допустимой законом степени Prosto и его операторы не несут ответственности за любые косвенные, случайные или последующие убытки, а также за потерю данных, прибыли или репутации, возникшие в связи с использованием (или невозможностью использования) платформы.',
          ],
        },
        {
          heading: '9. Изменения Условий',
          body: [
            'Мы можем периодически обновлять эти Условия. При существенных изменениях мы обновим дату выше и при необходимости уведомим вас. Продолжение использования Prosto после вступления изменений в силу означает ваше согласие с новой редакцией.',
          ],
        },
        {
          heading: '10. Сторонние подключения',
          body: [
            'Prosto позволяет по желанию подключать сторонние сервисы (например, привязать музыкальный аккаунт, чтобы показывать, что вы слушаете). При подключении сервиса также действуют условия и политика конфиденциальности этого провайдера, а мы получаем доступ только к тому, что вы разрешили. Вы можете отключить привязанный сервис в любой момент в настройках.',
          ],
        },
        {
          heading: '11. Обратная связь',
          body: [
            'Если вы присылаете нам идеи, предложения или отзывы о Prosto, мы можем использовать их для улучшения платформы без каких-либо обязательств или выплат вам.',
          ],
        },
        {
          heading: '12. Общие положения',
          body: [
            'Эти Условия вместе с Политикой конфиденциальности и Правилами сообщества составляют полное соглашение между вами и Prosto в отношении платформы.',
            'Если какая-либо часть этих Условий будет признана недействительной, остальные положения сохраняют силу. То, что мы не применяем какое-либо положение, не означает отказ от права сделать это позже.',
          ],
        },
        {
          heading: '13. Контакты',
          body: [
            'Вопросы об этих Условиях направляйте на support@justprosto.xyz.',
          ],
        },
      ],
    },
  },
  privacy: {
    en: {
      title: 'Privacy Policy',
      intro:
        'This Policy explains what information Prosto collects, how we use it, and the choices you have. We aim to collect only what we need to run the platform.',
      sections: [
        {
          heading: '1. Information we collect',
          body: [
            'Account information: your email address, username, and password (stored only as a secure hash). Optionally, profile details you add such as display name, bio, pronouns, avatar, and banner.',
            'Content you create: posts, comments, direct messages, and media you upload.',
            'Technical information: data needed to operate the service, such as session cookies, basic device/browser information, and limited logs used for security and abuse prevention.',
          ],
        },
        {
          heading: '2. How we use information',
          body: [
            'To create and maintain your account, authenticate you, and keep you signed in.',
            'To operate core features — the feed, profiles, search, and messaging.',
            'To send transactional emails you request, such as sign-in codes and password-reset links.',
            'To keep the platform safe: detecting spam, abuse, and unauthorized access, and enforcing our Terms and Community Guidelines.',
          ],
        },
        {
          heading: '3. Service providers',
          body: [
            'We use trusted providers to run Prosto. Authentication, database, and media storage are handled by Supabase. Transactional email is delivered by Resend. These providers process data only on our behalf and under their own security and privacy commitments.',
            'If you connect a third-party service (such as a music account), we store the access tokens needed to show your activity and only request the minimum permissions for that feature. You can disconnect it at any time in your settings, which removes the stored tokens.',
          ],
        },
        {
          heading: '4. Sharing and disclosure',
          body: [
            'We do not sell your personal information. Content you choose to make public (such as posts and your profile) is visible to others by design.',
            'We may disclose information if required by law, to enforce our Terms, or to protect the rights, safety, and security of Prosto and its users.',
          ],
        },
        {
          heading: '5. Data retention',
          body: [
            'We keep your information for as long as your account is active. When you delete your account, we delete your profile and associated data, except where limited retention is required by law or to resolve disputes and enforce our agreements.',
          ],
        },
        {
          heading: '6. Security',
          body: [
            'Passwords are stored as salted hashes, never in plain text. We apply reasonable technical and organizational measures to protect your data. No system is perfectly secure, so we cannot guarantee absolute security.',
          ],
        },
        {
          heading: '7. Your rights',
          body: [
            'You can view and edit your profile information at any time, and you can permanently delete your account from your settings. Depending on where you live, you may have additional rights to access, correct, or erase your personal data — contact us to exercise them.',
          ],
        },
        {
          heading: '8. Cookies and local storage',
          body: [
            'We use cookies and similar local storage only for essential purposes such as keeping your session active and remembering your theme and language preferences. We do not use them for third-party advertising.',
          ],
        },
        {
          heading: "9. Children's privacy",
          body: [
            'Prosto is not directed to children under 13, and we do not knowingly collect their personal information. If you believe a child has provided us data, contact us and we will remove it.',
          ],
        },
        {
          heading: '10. Changes to this Policy',
          body: [
            'We may update this Policy over time. We will revise the date above and, for material changes, take reasonable steps to notify you.',
          ],
        },
        {
          heading: '11. Contact',
          body: [
            'Privacy questions can be sent to privacy@justprosto.xyz.',
          ],
        },
      ],
    },
    ru: {
      title: 'Политика конфиденциальности',
      intro:
        'Эта Политика объясняет, какие данные собирает Prosto, как мы их используем и какие у вас есть возможности выбора. Мы стремимся собирать только то, что необходимо для работы платформы.',
      sections: [
        {
          heading: '1. Какие данные мы собираем',
          body: [
            'Данные аккаунта: адрес электронной почты, имя пользователя и пароль (хранится только в виде защищённого хеша). По желанию — данные профиля, которые вы добавляете: отображаемое имя, описание, местоимения, аватар и баннер.',
            'Создаваемый вами контент: посты, комментарии, личные сообщения и загружаемые медиафайлы.',
            'Технические данные: сведения, необходимые для работы сервиса, — сессионные cookie, базовая информация об устройстве/браузере и ограниченные журналы для безопасности и предотвращения злоупотреблений.',
          ],
        },
        {
          heading: '2. Как мы используем данные',
          body: [
            'Для создания и поддержки вашего аккаунта, аутентификации и сохранения входа в систему.',
            'Для работы основных функций — ленты, профилей, поиска и сообщений.',
            'Для отправки запрошенных вами транзакционных писем — кодов входа и ссылок для сброса пароля.',
            'Для безопасности платформы: выявления спама, злоупотреблений и несанкционированного доступа, а также соблюдения Условий и Правил сообщества.',
          ],
        },
        {
          heading: '3. Поставщики услуг',
          body: [
            'Для работы Prosto мы используем проверенных поставщиков. Аутентификация, база данных и хранение медиа обеспечиваются Supabase. Транзакционные письма доставляет Resend. Эти поставщики обрабатывают данные только по нашему поручению и в рамках собственных обязательств по безопасности и конфиденциальности.',
            'Если вы подключаете сторонний сервис (например, музыкальный аккаунт), мы храним токены доступа, необходимые для отображения вашей активности, и запрашиваем только минимально нужные для этой функции разрешения. Вы можете отключить сервис в любой момент в настройках — сохранённые токены при этом удаляются.',
          ],
        },
        {
          heading: '4. Передача и раскрытие',
          body: [
            'Мы не продаём ваши персональные данные. Контент, который вы делаете публичным (например, посты и профиль), по умолчанию виден другим.',
            'Мы можем раскрывать данные, если этого требует закон, для соблюдения наших Условий или для защиты прав, безопасности Prosto и его пользователей.',
          ],
        },
        {
          heading: '5. Хранение данных',
          body: [
            'Мы храним ваши данные, пока активен аккаунт. При удалении аккаунта мы удаляем профиль и связанные данные, за исключением случаев, когда ограниченное хранение требуется по закону или для разрешения споров и исполнения соглашений.',
          ],
        },
        {
          heading: '6. Безопасность',
          body: [
            'Пароли хранятся в виде хешей с солью и никогда — в открытом виде. Мы применяем разумные технические и организационные меры защиты. Ни одна система не является абсолютно безопасной, поэтому мы не можем гарантировать полную защищённость.',
          ],
        },
        {
          heading: '7. Ваши права',
          body: [
            'Вы можете в любой момент просматривать и изменять данные профиля, а также безвозвратно удалить аккаунт в настройках. В зависимости от страны проживания у вас могут быть дополнительные права на доступ, исправление или удаление персональных данных — свяжитесь с нами, чтобы ими воспользоваться.',
          ],
        },
        {
          heading: '8. Cookie и локальное хранилище',
          body: [
            'Мы используем cookie и аналогичное локальное хранилище только для необходимых целей: сохранения активной сессии и запоминания темы и языка. Мы не используем их для стороннней рекламы.',
          ],
        },
        {
          heading: '9. Конфиденциальность детей',
          body: [
            'Prosto не предназначен для детей младше 13 лет, и мы сознательно не собираем их персональные данные. Если вы считаете, что ребёнок предоставил нам данные, свяжитесь с нами, и мы их удалим.',
          ],
        },
        {
          heading: '10. Изменения Политики',
          body: [
            'Мы можем со временем обновлять эту Политику. Мы обновим дату выше и при существенных изменениях предпримем разумные шаги, чтобы уведомить вас.',
          ],
        },
        {
          heading: '11. Контакты',
          body: [
            'Вопросы о конфиденциальности направляйте на privacy@justprosto.xyz.',
          ],
        },
      ],
    },
  },
  guidelines: {
    en: {
      title: 'Community Guidelines',
      intro:
        'Prosto is a place to say it simply and connect with others. These Guidelines describe how to use the platform responsibly. Breaking them can lead to content removal or account restrictions.',
      sections: [
        {
          heading: '1. Be respectful',
          body: [
            'Treat others as you would want to be treated. Disagreement is fine; harassment, bullying, and targeted abuse are not.',
          ],
        },
        {
          heading: '2. Prohibited content',
          body: [
            'Do not post content that is illegal, or that promotes or facilitates illegal activity.',
            'No hate speech or content that attacks or dehumanizes people based on race, ethnicity, national origin, religion, gender, sexual orientation, disability, or similar characteristics.',
            'No content that sexualizes, endangers, or exploits minors in any way. This is a zero-tolerance rule and may be reported to the authorities.',
            'No graphic violence, incitement to violence, or content that glorifies self-harm.',
            'No non-consensual intimate imagery or sexual content involving non-consenting people.',
          ],
        },
        {
          heading: '3. No spam or manipulation',
          body: [
            'Do not send bulk or repetitive unsolicited messages, run scams, or use the platform to artificially inflate engagement.',
            'Do not distribute malware, phishing links, or other deceptive content.',
          ],
        },
        {
          heading: '4. Authenticity',
          body: [
            'Do not impersonate other people, brands, or organizations, or misrepresent your affiliation with them.',
          ],
        },
        {
          heading: '5. Respect security and integrity',
          body: [
            'Do not attempt to break, probe, or overload the platform, bypass rate limits, scrape data at scale, or access accounts or data that are not yours.',
          ],
        },
        {
          heading: '6. Respect intellectual property',
          body: [
            'Only post content you have the right to share. Do not upload material that infringes someone else\u2019s copyright or trademark.',
          ],
        },
        {
          heading: "7. Protect other people's privacy",
          body: [
            'Do not share private or personal information about others without their consent (for example, home address, phone number, or private messages). Exposing someone\u2019s private details to harass or endanger them is not allowed.',
          ],
        },
        {
          heading: '8. Safety and well-being',
          body: [
            'Do not encourage self-harm or suicide. If you or someone you know may be in danger, please contact your local emergency services or a crisis helpline right away — Prosto is not an emergency service.',
          ],
        },
        {
          heading: '9. Reporting and enforcement',
          body: [
            'If you see content that breaks these Guidelines, please report it. We review reports and may remove content, issue warnings, or restrict or remove accounts depending on the severity and history of violations.',
            'Questions or appeals can be sent to support@justprosto.xyz.',
          ],
        },
      ],
    },
    ru: {
      title: 'Правила сообщества',
      intro:
        'Prosto — это место, где можно говорить проще и общаться с другими. Эти Правила описывают, как пользоваться платформой ответственно. Их нарушение может привести к удалению контента или ограничению аккаунта.',
      sections: [
        {
          heading: '1. Уважайте других',
          body: [
            'Относитесь к другим так, как хотели бы, чтобы относились к вам. Несогласие — нормально; травля, преследование и адресные оскорбления — нет.',
          ],
        },
        {
          heading: '2. Запрещённый контент',
          body: [
            'Не публикуйте контент, который является незаконным или способствует противоправной деятельности.',
            'Запрещены разжигание ненависти и контент, унижающий людей по признаку расы, этнической или национальной принадлежности, религии, пола, сексуальной ориентации, инвалидности и подобных характеристик.',
            'Запрещён любой контент, который сексуализирует, подвергает опасности или эксплуатирует несовершеннолетних. Это правило с нулевой терпимостью; о таких случаях может быть сообщено властям.',
            'Запрещены сцены жестокого насилия, призывы к насилию и контент, прославляющий самоповреждение.',
            'Запрещены интимные изображения без согласия и сексуальный контент с участием людей без их согласия.',
          ],
        },
        {
          heading: '3. Без спама и манипуляций',
          body: [
            'Не рассылайте массовые или повторяющиеся нежелательные сообщения, не занимайтесь мошенничеством и не используйте платформу для искусственной накрутки активности.',
            'Не распространяйте вредоносное ПО, фишинговые ссылки и иной обманный контент.',
          ],
        },
        {
          heading: '4. Подлинность',
          body: [
            'Не выдавайте себя за других людей, бренды или организации и не искажайте свою связь с ними.',
          ],
        },
        {
          heading: '5. Уважайте безопасность и целостность',
          body: [
            'Не пытайтесь взломать, прозондировать или перегрузить платформу, обходить ограничения частоты запросов, массово выгружать данные или получать доступ к чужим аккаунтам и данным.',
          ],
        },
        {
          heading: '6. Уважайте интеллектуальную собственность',
          body: [
            'Публикуйте только тот контент, на который у вас есть права. Не загружайте материалы, нарушающие чужие авторские права или товарные знаки.',
          ],
        },
        {
          heading: '7. Уважайте приватность других',
          body: [
            'Не публикуйте личную или персональную информацию о других без их согласия (например, домашний адрес, номер телефона или личные сообщения). Раскрывать чужие личные данные с целью преследования или создания угрозы запрещено.',
          ],
        },
        {
          heading: '8. Безопасность и благополучие',
          body: [
            'Не поощряйте самоповреждение или суицид. Если вы или кто-то рядом может быть в опасности, немедленно обратитесь в местные экстренные службы или на линию помощи — Prosto не является экстренной службой.',
          ],
        },
        {
          heading: '9. Жалобы и меры',
          body: [
            'Если вы видите контент, нарушающий эти Правила, пожалуйста, сообщите о нём. Мы рассматриваем жалобы и можем удалять контент, выносить предупреждения, ограничивать или удалять аккаунты в зависимости от тяжести и истории нарушений.',
            'Вопросы и апелляции направляйте на support@justprosto.xyz.',
          ],
        },
      ],
    },
  },
};

/** Resolve a document for a slug + locale, defaulting to English. */
export function getLegalDoc(slug: LegalSlug, locale: string): LegalDoc {
  const loc: Locale = locale === 'ru' ? 'ru' : 'en';
  return legalDocs[slug][loc];
}
