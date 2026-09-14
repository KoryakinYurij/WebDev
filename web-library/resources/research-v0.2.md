# Повторный ресерч: основания и ограничения v0.2

Дата чтения: 14 сентября 2026. Цель — проверить конкретные инструкции, а не собрать максимально длинный каталог. Это целевой обзор первоисточников, не систематический метаанализ всей литературы и не проверка качества будущего сайта.

## Что изменило решения

| Вопрос | Прочитанный первоисточник | Вывод для нашей библиотеки |
| --- | --- | --- |
| Нужна ли вся библиотека в контексте? | [Agent Skills specification](https://agentskills.io/specification), структура, progressive disclosure | Небольшой скилл и выборочные материалы; спецификация формата не доказывает эффективность содержания |
| Гарантируют ли инструкции улучшение? | [Gloaguen et al., v2 от 23 июня 2026](https://arxiv.org/html/2602.11988v2), abstract и разделы исследования | Авторы не обнаружили общего улучшения success rate и сообщают рост стоимости в своих условиях; не превращать это в запрет всех инструкций |
| Есть ли положительные результаты? | [Lulla et al., v2 от 30 марта 2026](https://arxiv.org/html/2601.20404v2), abstract и методика | Авторы сообщают сокращение медианного времени и output tokens в изученных PR-задачах; это другие исходы, не доказательство лучшего дизайна |
| Как проверять агентный результат? | [Anthropic, Demystifying evals, 9 января 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), trials, graders, outcome | Отделять слова агента от артефакта, повторять попытки и сочетать техническую и человеческую оценку; наш протокол остаётся собственной адаптацией |
| Что взять из профессиональной системы? | [IBM Carbon typography](https://carbondesignsystem.com/elements/typography/overview/), productive/expressive | Выбирать типографическую иерархию под задачу, не тащить бренд, шрифты и всю компонентную систему |
| Нужна ли статическая основа? | [GOV.UK progressive enhancement](https://www.gov.uk/service-manual/technology/using-progressive-enhancement), построение устойчивого frontend | Для нашего документа начинать с работоспособного содержания; это не универсальный запрет сложных приложений |

Два исследования AGENTS.md рассматривают coding/PR-задачи, а не визуальную генерацию сайтов. Их результаты нельзя складывать в «средний процент пользы библиотеки» или переносить на текущую модель без эксперимента. Наша проверяемая гипотеза: выбранные инструкции уменьшают определённые ошибки при приемлемых затратах.

## Ошибки в ранее выбранных авторских гайдах

### 1. Типографика: перепутаны единицы и не сходится пример

Повторно прочитан [raw typography-systems.md](https://raw.githubusercontent.com/Eneryleen/ai-web-design-codex/main/00-foundations/typography-systems.md), разделы Accessibility constraints и Fluid typography. В определении крупного текста стоят 18px/14px, тогда как [W3C SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) использует 18pt/14pt. В нашей инструкции это исправлено на 24 CSS px / примерно 18.67 CSS px, с условиями начертания.

В примере, заявленном как 16px при 320px → 18px при 1280px, preferred = 0.9375rem + 0.2083vw. При root=16px верхняя граница даёт 15 + 2.66624 = 17.66624px, а не 18px. Это проверка арифметики, не браузерный тест. Также из [W3C Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) не следует универсальный нормативный минимум 16px или гарантия 200% resize только из наличия rem в clamp.

Действие: карточка ai-typography — retired в автоматическом наборе, сохранена причина. Заменена на Carbon для выбора ролей и W3C для проверок. Не объявляем весь репозиторий плохим по одному файлу.

### 2. Скролл: неверная версия поддержки и опасная подмена отключения

В [raw scroll-driven-experiences.md](https://raw.githubusercontent.com/Eneryleen/ai-web-design-codex/main/03-site-types/scroll-driven-experiences.md), Native CSS Scroll-Driven Animations, заявлен Safari 18+. В прочитанных [MDN browser-compat-data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/animation-timeline.json) для animation-timeline и scroll()/view() указан Safari 26, Firefox preview. Данные прочитаны на main, SHA не закреплён; не обещать поддержку конкретного устройства на их основании.

[MDN animation-timeline](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline) описывает скролл-временную шкалу и reset от animation shorthand; [MDN animation-duration](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-duration) — длительность. Наш вывод: сокращение duration само по себе нельзя принимать как доказательство отключения скролл-эффекта. В профиль добавлено явное прекращение анимаций/JS-обновлений и восстановление статической композиции.

Действие: ai-scroll убран из автоматической выдачи. Оставлены MDN, первичные данные совместимости и [web.dev animations guide](https://web.dev/articles/animations-guide). Статья web.dev обновлена 6 октября 2020, это не новая публикация: используем конкретные объяснения layout/paint и требования измерения, не её возраст как знак качества.

## Уточнение доступности

В [проверках библиотеки](../checks/review.md) даны точные URL W3C для Contrast, Reflow, Resize Text, Text Spacing, Target Size Minimum, Focus Not Obscured, Pause Stop Hide и Animation from Interactions. Разделены нормативные уровни A/AA/AAA, исключения и более строгие правила нашего брифа. Understanding — пояснительные документы, а не самостоятельный сертификат соответствия.

Отдельно прочитан [WAI-ARIA Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/): для toggle со стабильной подписью использовать согласованное aria-pressed; для подписи, меняющейся на следующее действие, этот атрибут не обязателен. Не дублировать состояние противоречащими способами.

[Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) прямо ограничивает охват автоматических проверок. [Visual comparisons](https://playwright.dev/docs/test-snapshots) описывает сравнение со снимком и зависимость результата от среды. Поэтому «axe прошёл» и «скриншот совпал» не означают ни полную доступность, ни хороший дизайн.

## Проверены, но не добавлены в runtime

Повторно открыты [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [GSAP README](https://github.com/greensock/GSAP), [awesome-design-systems](https://github.com/alexpate/awesome-design-systems), [Performance Checklist](https://github.com/thedaviddias/Front-End-Performance-Checklist) и [motion-primitives](https://github.com/ibelick/motion-primitives). Это просмотр документации/индекса, а не запуск компонентов. Не все внешние ссылки каталогов проверены.

GSAP остаётся вариантом для другой среды и реально сложной сцены. Каталог дизайн-систем — путь к конкретному первоисточнику, не обязательный контекст. Performance Checklist не подменяет замеры. Для motion-primitives не выбран и не запущен компонент, статус candidate сохранён. Никаких зависимостей не установлено.

## Ограничения и следующий эксперимент

Чтение источников проверяет обоснованность советов, но не их эффективность для данного агента. Сайтов A/B, браузерных доказательств и человеческой оценки здесь всё ещё нет. Предпочтения пользователя и визуальные эталоны не согласованы. Допустимый следующий шаг — один pilot и настоящий просмотр результата, затем сравнение core/profile с одинаковыми материалами, моделью и инструментами.