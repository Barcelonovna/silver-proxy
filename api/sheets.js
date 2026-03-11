export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sheet } = req.query;

  const SHEETS = {
    shop_days: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlDTGn9k-Q1I1erjx64LNwnpppZjFRHjvxTwL_5lM7TuEqqCJNrcwGskR_ipcnbMXgF9J6hepl_AK3/pub?gid=0&single=true&output=csv',
    shop_clusters: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlDTGn9k-Q1I1erjx64LNwnpppZjFRHjvxTwL_5lM7TuEqqCJNrcwGskR_ipcnbMXgF9J6hepl_AK3/pub?gid=1499640323&single=true&output=csv',
  };

  if (!sheet || !SHEETS[sheet]) {
    return res.status(400).json({ error: 'Unknown sheet. Use: shop_days or shop_clusters' });
  }

  try {
    const response = await fetch(SHEETS[sheet]);
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
    const csv = await response.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
