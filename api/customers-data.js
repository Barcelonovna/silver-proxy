// api/customers-data.js
// Читает закэшированные данные из Vercel Blob — мгновенно (~50ms).
// GET ?type=overview | clients | status

const { list } = require('@vercel/blob');

// Читаем JSON из публичного URL Blob-файла
async function fetchBlobJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Blob fetch failed: ${r.status}`);
  return r.json();
}

// Получаем URL нужного файла по имени
async function getBlobUrl(filename) {
  const { blobs } = await list({
    prefix: filename,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  const blob = blobs.find(b => b.pathname === filename);
  if (!blob) return null;
  return blob.url;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  try {
    // Сначала читаем meta — там хранятся URL-ы всех файлов
    const metaUrl = await getBlobUrl('silver/customers-meta.json');

    if (type === 'status') {
      if (!metaUrl) return res.status(200).json({ ready: false });
      const meta = await fetchBlobJson(metaUrl);
      return res.status(200).json({ ready: true, computedAt: meta.computedAt, total: meta.total });
    }

    if (!metaUrl) {
      return res.status(404).json({ error: 'No data. Run /api/precompute first.' });
    }

    const meta = await fetchBlobJson(metaUrl);

    if (type === 'overview') {
      const data = await fetchBlobJson(meta.overviewUrl);
      return res.status(200).json(data);
    }

    if (type === 'clients') {
      const data = await fetchBlobJson(meta.clientsUrl);
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Unknown type. Use: overview | clients | status' });

  } catch (err) {
    console.error('customers-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
