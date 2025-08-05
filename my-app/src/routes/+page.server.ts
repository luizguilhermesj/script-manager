import { db } from '$lib/server/db';
import { commands } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';

export const load = async () => {
  const allCommands = await db.select().from(commands);
  return {
    commands: allCommands,
  };
};

export const actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    const name = data.get('name');
    const command = data.get('command');

    if (!name || !command) {
      return fail(400, { name, command, missing: true });
    }

    await db.insert(commands).values({ name: String(name), command: String(command) });

    return { success: true };
  },
};
