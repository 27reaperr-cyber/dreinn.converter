# dreinn.converter (Node.js)

Локальный редактор Telegram animated emoji/sticker (Lottie) с экспортом PNG/GIF, текстовыми слоями и импортом паков по ссылке.

## Требования (Windows 10)

- Node.js 18+ (лучше 20+)
- npm

Проверка:

```powershell
node -v
npm -v
```

## Запуск локально (Windows 10)

```powershell
cd c:\telegram-bots\converter
npm install
npm run dev
```

Открыть:

- http://localhost:3000

## Импорт Telegram паков

Поддерживаемые ссылки:

- `https://t.me/addstickers/...`
- `https://t.me/addemoji/...`

Авторизация для импорта Telegram паков только через переменную окружения `TELEGRAM_BOT_TOKEN`.

Пример для PowerShell (текущая сессия):

```powershell
$env:TELEGRAM_BOT_TOKEN="123456:ABCDEF..."
npm run dev
```

Важно:

- Для редактора поддерживаются animated форматы (`.tgs` / `.json`)
- `WebM` не поддерживается

## Что добавлено

- Исправлен GIF экспорт: покадровый рендер всех кадров, 60 FPS и авто-сжатие (цель < 2MB)
- `Sticker Scale` перенесен в раздел `Экспорт`
- Ребрендинг в `dreinn.converter` (текстовый логотип в шапке)
- Добавлена Telegram ссылка: `t.me/dreinnh`
- Автосохранение процесса в `localStorage` + авто-восстановление
- Импорт Telegram пака по ссылке, список элементов и выбор для загрузки
- Дополнительные UI-анимации и эффекты в стиле Telegram

## Деплой на Vercel

1. Установить Vercel CLI:

```powershell
npm i -g vercel
```

2. В корне проекта:

```powershell
cd c:\telegram-bots\converter
vercel
```

3. Продакшн:

```powershell
vercel --prod
```

Если используете импорт паков в проде, добавьте `TELEGRAM_BOT_TOKEN` в Environment Variables проекта Vercel.

## Структура

- `public/index.html` — интерфейс и логика редактора
- `public/styles.css` — стили
- `server.js` — Node.js сервер + Telegram API proxy endpoints
- `scripts/copy-lottie.js` — копирование vendor-файлов
- `vercel.json` — конфиг деплоя


