const mysql = require('mysql2/promise');

function isSafeQuery(sql) {
  return sql.trim().toUpperCase().startsWith('SELECT');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'No SQL provided' });
  if (!isSafeQuery(sql)) return res.status(403).json({ error: 'Only SELECT allowed' });

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      port: parseInt(process.env.DB_PORT || '3306'),
      ssl: false,
      connectTimeout: 10000,
      charset: 'UTF8_GENERAL_CI',
      timezone: '+03:00',
    });
    await connection.query("SET NAMES 'utf8'");
    await connection.query("SET CHARACTER SET utf8");
    await connection.query("SET character_set_connection=utf8");
    const [rows] = await connection.execute(sql);
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('DB error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.end();
  }
}
