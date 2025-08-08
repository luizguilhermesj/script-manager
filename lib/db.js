const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

let db = null;

async function initializeDatabase() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'commands.db');
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');
    await db.exec(schema);
  }
  return db;
}

module.exports = { initializeDatabase };
