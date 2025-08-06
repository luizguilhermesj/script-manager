import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { commands } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
  const { id } = params;
  const command = await db.query.commands.findFirst({
    where: eq(commands.id, Number(id)),
    with: {
      args: true,
    },
  });
  return json(command);
}

export async function PUT({ params, request }) {
  const { id } = params;
  const { name, command } = await request.json();
  await db.update(commands).set({ name, command }).where(eq(commands.id, Number(id)));
  const updatedCommand = await db.query.commands.findFirst({
    where: eq(commands.id, Number(id)),
    with: {
      args: true,
    },
  });
  return json(updatedCommand);
}

export async function DELETE({ params }) {
  const { id } = params;
  await db.delete(commands).where(eq(commands.id, Number(id)));
  return new Response(null, { status: 204 });
}
