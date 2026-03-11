# Silver DB Proxy

MySQL прокси для дашбордов Сильвер. Принимает SELECT-запросы от React-артефактов и возвращает данные из базы.

## Деплой на Vercel

### 1. Загрузите на GitHub

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/ВАШ_ЛОГИН/silver-proxy.git
git push -u origin main
```

### 2. Подключите к Vercel

1. Зайдите на https://vercel.com
2. Нажмите **"Add New Project"**
3. Выберите репозиторий **silver-proxy**
4. Нажмите **"Deploy"**

### 3. Добавьте переменные окружения

В Vercel → Settings → Environment Variables добавьте:

| Key | Value |
|-----|-------|
| DB_HOST | 78.108.90.184 |
| DB_NAME | sl_wildberries_9 |
| DB_USER | sl_wildberries_9 |
| DB_PASS | ВАШ_НОВЫЙ_ПАРОЛЬ |
| DB_PORT | 3306 |

> ⚠️ Используйте новый пароль, который вы установили после смены старого!

### 4. Redeploy

После добавления переменных нажмите **Redeploy**.

### 5. Скопируйте URL

После деплоя Vercel даст URL вида:
`https://silver-proxy-xxxxxxx.vercel.app`

Этот URL нужно будет вставить в React-артефакт.

## Проверка

```bash
curl -X POST https://silver-proxy-xxxxxxx.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) as cnt FROM sales"}'
```

Должен вернуть: `{"data":[{"cnt":12345}]}`
