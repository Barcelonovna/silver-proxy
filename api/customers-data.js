// api/customers-data.js
// Читает данные из Vercel Blob через list() + публичный URL.
// GET ?type=overview | clients | status

const { list } = require('@vercel/blob');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// Находим blob по точному имени файла и читаем его как JSON
async function readBlob(filename) {
  const { blobs } = await list({ prefix: filename, token: TOKEN, limit: 5 });
  // Ищем точное совпадение по pathname
  const blob = blobs.find(b => b.pathname === filename);
  if (!blob) return null;
  // Публичный URL — читаем напрямую fetch
  const r = await fetch(blob.url);
  if (!r.ok) throw new Error(`Blob fetch ${filename} failed: ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  try {
    if (type === 'status') {
      const meta = await readBlob('silver/customers-meta.json');
      if (!meta) return res.status(200).json({ ready: false });
      return res.status(200).json({ ready: true, computedAt: meta.computedAt, total: meta.total });
    }

    // Для всех остальных типов сначала читаем meta
    const meta = await readBlob('silver/customers-meta.json');
    if (!meta) {
      return res.status(404).json({ error: 'No data. Run /api/precompute first.' });
    }

    if (type === 'overview') {
      // Читаем по URL из meta (быстрее чем list снова)
      const r = await fetch(meta.overviewUrl);
      const data = await r.json();
      return res.status(200).json(data);
    }

    if (type === 'clients') {
      const r = await fetch(meta.clientsUrl);
      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Unknown type. Use: overview | clients | status' });

  } catch (err) {
    console.error('customers-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
