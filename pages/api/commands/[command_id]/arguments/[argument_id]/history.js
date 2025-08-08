import { initializeDatabase } from '@lib/db';

export default async function handler(req, res) {
  const { command_id, argument_id } = req.query;
  const db = await initializeDatabase();

  if (req.method === 'GET') {
    try {
      // Example: fetch last 10 values for this argument id and command id
      const rows = await db.all(
        'SELECT DISTINCT value FROM argument_history WHERE command_id = ? AND argument_id = ? ORDER BY id DESC LIMIT 10',
        [command_id, argument_id]
      );
      res.status(200).json(rows.map(r => r.value));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
