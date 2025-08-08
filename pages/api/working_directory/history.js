import { initializeDatabase } from '@lib/db';

export default async function handler(req, res) {
  const db = await initializeDatabase();

  if (req.method === 'GET') {
    try {
      const rows = await db.all("SELECT DISTINCT path FROM working_directory_history ORDER BY id DESC LIMIT 10", []);
      res.status(200).json(rows.map(r => r.path));
    } catch (err) {
      res.status(500).json({ "error": err.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
