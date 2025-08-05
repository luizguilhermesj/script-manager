import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { commands } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const allCommands = await db.select().from(commands);
  return json(allCommands);
}

export async function POST(event) {
  const { name, command } = await event.request.json();
  const newCommand = await db.insert(commands).values({ name, command }).returning();
  return json(newCommand[0]);
}
