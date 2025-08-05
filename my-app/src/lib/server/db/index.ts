import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';

const sqlite = new Database(env.DATABASE_URL);
export const db = drizzle(sqlite);
