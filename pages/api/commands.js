import { initializeDatabase } from '@lib/db';

export default async function handler(req, res) {
  const db = await initializeDatabase();

  if (req.method === 'GET') {
    const rows = await db.all("SELECT * FROM commands");
    const commands = rows.map(row => JSON.parse(row.data));
    res.status(200).json(commands);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
