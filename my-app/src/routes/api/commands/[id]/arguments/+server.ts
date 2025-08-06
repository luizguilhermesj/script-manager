import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { commandArguments } from '$lib/server/db/schema';

export async function POST({ params, request }) {
  const { id: commandId } = params;
  const { name, value, isFixed } = await request.json();
  const newArgument = await db.insert(commandArguments).values({ commandId: Number(commandId), name, value, isFixed }).returning();
  return json(newArgument[0]);
}
