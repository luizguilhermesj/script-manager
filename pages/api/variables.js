import { initializeDatabase } from '@lib/db';

export default async function handler(req, res) {
  const db = await initializeDatabase();

  if (req.method === 'GET') {
    const rows = await db.all("SELECT * FROM variables");
    res.status(200).json(rows);
  } else if (req.method === 'POST') {
    const { id, name, value } = req.body;
    await db.run('INSERT INTO variables (id, name, value) VALUES (?, ?, ?)', [id, name, value]);
    res.status(200).json({ id, name, value });
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
