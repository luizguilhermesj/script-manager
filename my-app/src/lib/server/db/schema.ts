import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const commands = sqliteTable('commands', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  command: text('command').notNull(),
});
