// api/precompute.js
// Сохраняет кэш аналитики в Vercel Blob (Public store).

const mysql = require('mysql2/promise');
const { put } = require('@vercel/blob');

const EXCL = "warehouseName NOT IN ('ИМ-курьеры','Склад ОЗОН','ИМ-отгрузка')";

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

async function safeQuery(conn, sql, label) {
  const result = await conn.execute(sql);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
  return rows;
}

async function saveBlob(filename, data) {
  const json = JSON.stringify(data);
  const result = await put(filename, json, {
    access: 'public',           // Public store требует public
    addRandomSuffix: false,     // Фиксированное имя — перезапись при пересчёте
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return result.url; // Возвращаем публичный URL для чтения
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { secret } = req.body || {};
  if (process.env.PRECOMPUTE_SECRET && secret !== process.env.PRECOMPUTE_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const t0 = Date.now();
  const log = [];
  let conn;

  try {
    conn = await getDB();
    log.push('✓ DB connected');

    log.push('1/5 Агрегат продаж...');
    const clientRows = await safeQuery(conn, `
      SELECT
        clientPhone,
        COUNT(DISTINCT docID)                                              AS all_visits,
        COUNT(DISTINCT CASE WHEN price > 1 THEN docID END)                AS real_visits,
        COUNT(DISTINCT CASE WHEN price <= 1 AND price > 0 THEN docID END) AS gift_visits,
        ROUND(SUM(CASE WHEN price > 1 THEN \`sum\` ELSE 0 END))           AS revenue,
        ROUND(AVG(CASE WHEN price > 1 THEN price END))                    AS avg_price,
        DATEDIFF(CURDATE(), MAX(CASE WHEN price > 1 THEN docDate END))    AS days_since_buy,
        COUNT(DISTINCT warehouseName)                                     AS shops_count
      FROM sales
      WHERE ${EXCL} AND clientPhone IS NOT NULL AND clientPhone != ''
      GROUP BY clientPhone
    `, 'clientRows');
    log.push(`✓ clientRows: ${clientRows.length}`);

    log.push('2/5 Карты лояльности...');
    const loyaltyRows = await safeQuery(conn, `
      SELECT clientPhone, gender,
        TIMESTAMPDIFF(YEAR, birthday, CURDATE()) AS age
      FROM loyaltyCards
      WHERE clientPhone IS NOT NULL AND clientPhone != ''
    `, 'loyaltyRows');
    log.push(`✓ loyaltyRows: ${loyaltyRows.length}`);

    log.push('3/5 История SMS...');
    const smsRows = await safeQuery(conn, `
      SELECT phone, COUNT(*) AS sms_count
      FROM SendingSMS WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone
    `, 'smsRows');
    log.push(`✓ smsRows: ${smsRows.length}`);

    log.push('4/5 Магазины...');
    const shopRows = await safeQuery(conn, `
      SELECT warehouseName,
        COUNT(DISTINCT CASE WHEN price > 1 THEN clientPhone END)        AS real_buyers,
        ROUND(SUM(CASE WHEN price > 1 THEN \`sum\` ELSE 0 END))         AS revenue,
        ROUND(AVG(CASE WHEN price > 1 THEN price END))                  AS avg_price
      FROM sales
      WHERE ${EXCL} AND clientPhone IS NOT NULL AND clientPhone != ''
      GROUP BY warehouseName ORDER BY real_buyers DESC
    `, 'shopRows');
    log.push(`✓ shopRows: ${shopRows.length}`);

    log.push('5/5 Коллекции и динамика...');
    const collectionRows = await safeQuery(conn, `
      SELECT collectionArticle AS collection,
        COUNT(DISTINCT clientPhone) AS buyers,
        SUM(CASE WHEN price > 1 THEN quantity ELSE 0 END) AS qty,
        ROUND(SUM(CASE WHEN price > 1 THEN \`sum\` ELSE 0 END)) AS revenue
      FROM sales
      WHERE ${EXCL} AND price > 1
        AND collectionArticle IS NOT NULL AND collectionArticle != ''
      GROUP BY collectionArticle ORDER BY revenue DESC LIMIT 20
    `, 'collectionRows');

    const monthlyRows = await safeQuery(conn, `
      SELECT DATE_FORMAT(docDate,'%Y-%m') AS ym,
        COUNT(DISTINCT CASE WHEN price > 1 THEN clientPhone END)               AS buyers,
        COUNT(DISTINCT CASE WHEN price <= 1 AND price > 0 THEN clientPhone END) AS gifters,
        COUNT(DISTINCT CASE WHEN price > 1 THEN docID END)                     AS receipts,
        ROUND(SUM(CASE WHEN price > 1 THEN \`sum\` ELSE 0 END))                AS revenue
      FROM sales
      WHERE ${EXCL} AND docDate >= DATE_SUB(CURDATE(), INTERVAL 13 MONTH)
        AND clientPhone IS NOT NULL AND clientPhone != ''
      GROUP BY ym ORDER BY ym
    `, 'monthlyRows');
    log.push(`✓ collections: ${collectionRows.length}, monthly: ${monthlyRows.length}`);

    // Обогащение в JS
    log.push('Обогащение...');
    const cardMap = {};
    loyaltyRows.forEach(r => { if (r.clientPhone) cardMap[r.clientPhone] = r; });
    const smsMap = {};
    smsRows.forEach(r => { if (r.phone) smsMap[r.phone] = Number(r.sms_count) || 0; });

    const SEND_SEGS = new Set(['VIP','Лояльный','Активный','Спящий','Потенциальный']);

    const enriched = clientRows
      .filter(r => r.clientPhone && cardMap[r.clientPhone])
      .map(r => {
        const card    = cardMap[r.clientPhone] || {};
        const smsCnt  = smsMap[r.clientPhone]  || 0;
        const rv  = Number(r.real_visits)  || 0;
        const gv  = Number(r.gift_visits)  || 0;
        const rev = Number(r.revenue)      || 0;
        const dsb = r.days_since_buy != null ? Number(r.days_since_buy) : null;
        const totalCost = smsCnt * 8 + gv * 120;
        const roi = totalCost > 0 ? Math.round((rev - totalCost) / totalCost * 100) : null;
        const d = dsb ?? 9999;
        let seg;
        if      (rv >= 5 && d <= 90)                seg = 'VIP';
        else if (rv >= 3 && d <= 180)               seg = 'Лояльный';
        else if (rv >= 1 && d <= 180)               seg = 'Активный';
        else if (rv >= 1 && d <= 365)               seg = 'Спящий';
        else if (rv >= 1 && d >  365)               seg = 'Потерянный';
        else if (rv === 0 && gv > 0 && smsCnt >= 5) seg = 'Халявщик';
        else if (rv === 0 && gv > 0)                seg = 'Потенциальный';
        else                                        seg = 'Нет покупок';
        return {
          p: r.clientPhone, rv, gv, rev,
          ap: Number(r.avg_price) || 0, dsb,
          sc: Number(r.shops_count) || 1,
          gen: card.gender || '', age: Number(card.age) || 0,
          sms: smsCnt, roi, seg,
          smsRec: SEND_SEGS.has(seg) ? 'send' : 'exclude',
        };
      });
    log.push(`✓ enriched: ${enriched.length}`);

    // Агрегаты для обзора
    const totalCards  = loyaltyRows.length;
    const buyers      = enriched.filter(r => r.rv > 0).length;
    const giftOnly    = enriched.filter(r => r.rv === 0 && r.gv > 0).length;
    const giftAny     = enriched.filter(r => r.gv > 0).length;
    const giftThenBuy = enriched.filter(r => r.gv > 0 && r.rv > 0).length;
    const convRate    = giftAny > 0 ? +(giftThenBuy / giftAny * 100).toFixed(1) : 0;

    const freqMap = {};
    enriched.forEach(r => {
      const g = r.rv===0?'0 — только подарки':r.rv===1?'1 покупка':r.rv===2?'2 покупки':r.rv<=5?'3–5 покупок':r.rv<=10?'6–10 покупок':'11+ покупок';
      if (!freqMap[g]) freqMap[g] = { label: g, cnt: 0, rev: 0 };
      freqMap[g].cnt++; freqMap[g].rev += r.rev;
    });
    const genderMap = {};
    enriched.forEach(r => { const g = r.gen||'не указан'; genderMap[g]=(genderMap[g]||0)+1; });

    const computedAt = new Date().toISOString();

    // Сохраняем в Blob — получаем публичные URL
    log.push('Сохраняем в Blob...');

    const overviewUrl = await saveBlob('silver/customers-overview.json', {
      computedAt, totalCards, buyers, giftOnly, giftAny, giftThenBuy, convRate,
      freqDist: Object.values(freqMap),
      genderDist: Object.entries(genderMap).map(([gender,cnt])=>({gender,cnt})).sort((a,b)=>b.cnt-a.cnt),
      shopStats: shopRows, collectionStats: collectionRows, monthlyStats: monthlyRows,
    });
    log.push(`✓ overview: ${overviewUrl}`);

    const clientsUrl = await saveBlob('silver/customers-clients.json', {
      computedAt, total: enriched.length, clients: enriched,
    });
    log.push(`✓ clients: ${clientsUrl}`);

    // Meta хранит публичные URL двух файлов
    const metaUrl = await saveBlob('silver/customers-meta.json', {
      computedAt, overviewUrl, clientsUrl, total: enriched.length,
    });
    log.push(`✓ meta: ${metaUrl}`);

    // Сохраняем metaUrl в env недоступно — возвращаем его в ответе
    // customers-data.js будет искать meta через list()
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return res.status(200).json({ ok: true, elapsed: `${elapsed}s`, clients: enriched.length, metaUrl, log });

  } catch (err) {
    console.error('Precompute error:', err);
    return res.status(500).json({ error: err.message, log });
  } finally {
    if (conn) await conn.end();
  }
}
