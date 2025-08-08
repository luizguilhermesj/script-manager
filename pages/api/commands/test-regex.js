// Test endpoint for regex extraction
import { initializeDatabase } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { output, regex } = req.body;
  if (!output || !regex) {
    return res.status(400).json({ error: 'Missing output or regex in request body.' });
  }

  try {
    const re = new RegExp(regex);
    const match = output.match(re);
    if (match) {
      res.status(200).json({ match: match[1] ? match[1] : match[0] });
    } else {
      res.status(200).json({ match: null, error: 'No match found.' });
    }
  } catch (e) {
    res.status(400).json({ error: `Invalid regex: ${e.message}` });
  }
}
