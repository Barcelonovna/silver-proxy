const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  port: parseInt(process.env.DB_PORT || '3306'),
  ssl: false,
  connectTimeout: 10000,
};

// Разрешённые запросы — только SELECT, никаких INSERT/UPDATE/DELETE
function isSafeQuery(sql) {
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith('SELECT');
}

export default async function handler(req, res) {
  // CORS — разрешаем запросы с любого origin (claude.ai артефакты)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sql } = req.body;

  if (!sql) {
    return res.status(400).json({ error: 'No SQL query provided' });
  }

  if (!isSafeQuery(sql)) {
    return res.status(403).json({ error: 'Only SELECT queries are allowed' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(sql);
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('DB error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.end();
  }
}
