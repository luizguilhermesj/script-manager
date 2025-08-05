import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { commands } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
  const { id } = params;
  const command = await db.select().from(commands).where(eq(commands.id, Number(id)));
  return json(command[0]);
}

export async function PUT({ params, request }) {
  const { id } = params;
  const { name, command } = await request.json();
  const updatedCommand = await db.update(commands).set({ name, command }).where(eq(commands.id, Number(id))).returning();
  return json(updatedCommand[0]);
}

export async function DELETE({ params }) {
  const { id } = params;
  await db.delete(commands).where(eq(commands.id, Number(id)));
  return new Response(null, { status: 204 });
}
