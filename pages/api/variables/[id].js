import { initializeDatabase } from '@lib/db';

export default async function handler(req, res) {
  const { id } = req.query;
  const db = await initializeDatabase();

  if (req.method === 'PUT') {
    const { name, value } = req.body;
    await db.run('UPDATE variables SET name = ?, value = ? WHERE id = ?', [name, value, id]);
    res.status(200).json({ id, name, value });
  } else if (req.method === 'DELETE') {
    await db.run('DELETE FROM variables WHERE id = ?', [id]);
    res.status(200).json({ message: 'Variable deleted' });
  } else {
    res.setHeader('Allow', ['PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
