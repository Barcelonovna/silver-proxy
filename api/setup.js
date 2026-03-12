// api/setup.js
// Одноразовый endpoint для создания таблицы client_stats.
// Вызвать один раз: GET /api/setup?secret=silver2026
// После успеха можно удалить этот файл из репозитория.

const mysql = require('mysql2/promise');

async function getDB() {
  const conn = await mysql.createConnection({
    host:           process.env.DB_HOST,
    database:       process.env.DB_NAME,
    user:           process.env.DB_USER,
    password:       process.env.DB_PASS,
    port:           parseInt(process.env.DB_PORT || '3306'),
    ssl:            false,
    connectTimeout: 30000,
    charset:        'UTF8_GENERAL_CI',
    timezone:       '+03:00',
  });
  await conn.query("SET NAMES 'utf8'");
  return conn;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Защита секретом
  const { secret } = req.query;
  if (secret !== process.env.PRECOMPUTE_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const log = [];
  let conn;

  try {
    conn = await getDB();
    log.push('✓ DB connected');

    // Шаг 1: удаляем старую таблицу если есть
    await conn.execute('DROP TABLE IF EXISTS client_stats');
    log.push('✓ DROP TABLE IF EXISTS client_stats');

    // Шаг 2: создаём новую таблицу с агрегатами
    await conn.execute(`
      CREATE TABLE client_stats AS
      SELECT
        s.clientPhone,
        COUNT(DISTINCT CASE WHEN s.price > 1 THEN s.docID END)                  AS real_visits,
        COUNT(DISTINCT CASE WHEN s.price <= 1 AND s.price > 0 THEN s.docID END) AS gift_visits,
        ROUND(SUM(CASE WHEN s.price > 1 THEN s.sum ELSE 0 END))                 AS revenue,
        ROUND(AVG(CASE WHEN s.price > 1 THEN s.price END))                      AS avg_price,
        DATEDIFF(CURDATE(), MAX(CASE WHEN s.price > 1 THEN s.docDate END))      AS days_since_buy,
        COUNT(DISTINCT s.warehouseName)                                         AS shops_count,
        lc.gender,
        TIMESTAMPDIFF(YEAR, lc.birthday, CURDATE())                             AS age,
        COALESCE(sm.sms_count, 0)                                               AS sms_count
      FROM sales s
      JOIN loyaltyCards lc ON lc.clientPhone = s.clientPhone
      LEFT JOIN (
        SELECT phone, COUNT(*) AS sms_count
        FROM SendingSMS
        GROUP BY phone
      ) sm ON sm.phone = s.clientPhone
      WHERE s.warehouseName NOT IN ('ИМ-курьеры','Склад ОЗОН','ИМ-отгрузка')
        AND s.clientPhone IS NOT NULL
        AND s.clientPhone != ''
      GROUP BY s.clientPhone, lc.gender, lc.birthday
    `);
    log.push('✓ CREATE TABLE client_stats — done');

    // Шаг 3: добавляем индекс для быстрого поиска
    await conn.execute('ALTER TABLE client_stats ADD PRIMARY KEY (clientPhone(50))');
    log.push('✓ PRIMARY KEY added');

    // Шаг 4: проверяем сколько строк
    const [rows] = await conn.execute('SELECT COUNT(*) AS cnt FROM client_stats');
    const cnt = rows[0].cnt;
    log.push(`✓ client_stats содержит ${cnt} строк`);

    return res.status(200).json({
      ok: true,
      rows: cnt,
      message: 'Таблица client_stats создана успешно! Теперь можно удалить api/setup.js',
      log,
    });

  } catch (err) {
    console.error('Setup error:', err);
    return res.status(500).json({ error: err.message, log });
  } finally {
    if (conn) await conn.end();
  }
}
