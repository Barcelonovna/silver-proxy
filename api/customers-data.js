// api/customers-data.js
// Читает приватные Blob-файлы через download() — работает быстро (~100ms).
// GET ?type=overview | clients | status

const { list, download } = require('@vercel/blob');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function readBlobByPath(pathname) {
  // Ищем blob по pathname через list
  const { blobs } = await list({ prefix: pathname, token: TOKEN });
  const blob = blobs.find(b => b.pathname === pathname);
  if (!blob) return null;

  // Скачиваем содержимое
  const response = await download(blob.url, { token: TOKEN });
  const text = await response.text();
  return JSON.parse(text);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  try {
    // Читаем meta-файл
    const meta = await readBlobByPath('silver/customers-meta.json');

    if (type === 'status') {
      if (!meta) return res.status(200).json({ ready: false });
      return res.status(200).json({ ready: true, computedAt: meta.computedAt, total: meta.total });
    }

    if (!meta) {
      return res.status(404).json({ error: 'No data. Run /api/precompute first.' });
    }

    if (type === 'overview') {
      const data = await readBlobByPath(meta.overviewPath);
      if (!data) return res.status(404).json({ error: 'Overview not found in Blob.' });
      return res.status(200).json(data);
    }

    if (type === 'clients') {
      const data = await readBlobByPath(meta.clientsPath);
      if (!data) return res.status(404).json({ error: 'Clients not found in Blob.' });
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Unknown type. Use: overview | clients | status' });

  } catch (err) {
    console.error('customers-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
