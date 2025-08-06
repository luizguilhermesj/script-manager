import { db } from '$lib/server/db';
import { commands, commandArguments } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';

export const load = async ({ params }) => {
  const { id } = params;
  const command = await db.query.commands.findFirst({
    where: eq(commands.id, Number(id)),
    with: {
      args: true,
    },
  });

  if (!command) {
    throw error(404, 'Command not found');
  }

  return {
    command,
  };
};

export const actions = {
  createArgument: async ({ params, request }) => {
    const { id: commandId } = params;
    const data = await request.formData();
    const name = data.get('name');
    const value = data.get('value');
    const isFixed = data.get('isFixed') === 'on';

    if (!name) {
      return fail(400, { name, value, isFixed, missing: true });
    }

    await db.insert(commandArguments).values({ commandId: Number(commandId), name: String(name), value: String(value), isFixed });

    return { success: true };
  },
};
