// Пароли хранятся в переменных окружения Vercel
// USERS=admin:Im9zRYmw1I,natalya:SHcU9l7gMo,irada:7gpqjr4NcM,manager:Arjz5Q572C,director:r7zveeZdtG

function getUsers() {
  const raw = process.env.USERS || '';
  const users = {};
  raw.split(',').forEach(pair => {
    const [login, password] = pair.split(':');
    if (login && password) users[login.trim()] = password.trim();
  });
  return users;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ ok: false, error: 'Login and password required' });

  const users = getUsers();
  if (users[login] && users[login] === password) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Invalid credentials' });
}
