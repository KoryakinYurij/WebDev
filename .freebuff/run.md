# Run doc — MINDFIELD (`Test 1`)

Проект лежит **во вложенном каталоге** `Test 1` рабочего пространства, а не в его корне.
Все команды ниже выполняются из `Test 1` — из корня ни `npm ci`, ни `vite` не найдут конфиг.

## 1. Воспроизвести артефакты (свежий checkout)

```bash
cd "Test 1"
npm ci                     # npm + package-lock.json, пакетный менеджер один
```

- **`.env`-файлов нет и не требуется.** Пользовательские настройки (интенсивность движения,
  reduced-motion, качество сцены) живут в `localStorage` под ключом `mindfield.motion`;
  копировать из основного checkout нечего.
- **Токены** генерируются, а не редактируются: `npm run tokens` (= `validate-tokens.mjs`
  + `build-tokens.mjs`) пишет `src/styles/tokens.css` и `src/generated/tokens.ts`
  из `tokens/design.tokens.json`. Руками эти два файла не править — правка живёт до
  следующего запуска. `npm run dev` и `npm run build` вызывают генерацию сами.
- **Ассеты превью** `public/og.jpg` и `public/apple-touch-icon.png` — сгенерированные
  (`npm run og`), в репозитории они лежат готовыми. Пересборка нужна только при смене
  палитры или текста карточки и требует доступа к Google Fonts: без сети скрипт осознанно
  падает, а не отдаёт карточку с системными гарнитурами. `public/favicon.svg` и
  `public/robots.txt` написаны руками.
- `dist/` и `test-results/` — выходные каталоги, в git их нет.

## 2. Запустить сервер

Порт по умолчанию — **5173** (дефолт Vite). Не занимать **4173**: он принадлежит Playwright
(`webServer` в `playwright.config.ts`, `reuseExistingServer: false`), и занятый порт ломает `npm run check`.

Запуск отсоединённым на Windows (из корня workspace, рабочая папка — `Test 1`):

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','5173' -WorkingDirectory 'D:\Code AI\Projects\WebDev\Test 1' -RedirectStandardOutput 'D:\Code AI\Projects\WebDev\.freebuff\preview.log' -RedirectStandardError 'D:\Code AI\Projects\WebDev\.freebuff\preview.log.err' -WindowStyle Hidden -PassThru).Id"
```

- `npm.cmd`, а не `npm`: Start-Process не разворачивает shell-шим. Имя исполняемого файла — точно.
- stdout и stderr — **в два разных файла**: PowerShell падает, если указать один путь дважды.
- Порт слушает дочерний `node` (Vite), а не сам `npm.cmd`. Пид для регистрации превью —
  из `netstat -ano | grep 127.0.0.1:5173` (последняя колонка), живучесть — `Get-Process -Id <pid>`.
- Готовность: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/` → `200`
  (в логе при этом `VITE v8 ready`). Только после этого регистрировать превью.
- Остановка: `taskkill //PID <pid> //F` (в Git Bash — именно двойной слэш).

Альтернатива без отдельного процесса — превью-сервер Playwright: он поднимает тот же `vite`
на 4173 автоматически во время `npm run test:e2e`.

## 3. Гейты

```bash
cd "Test 1"
npm run check   # tokens + typecheck + vite build + бюджет JS/CSS + 9 Playwright-тестов
```

`npm run check` прогоняется в CI на push и PR (`.github/workflows/check.yml`, `working-directory: Test 1`).
