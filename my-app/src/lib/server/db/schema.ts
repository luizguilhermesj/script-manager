import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const commands = sqliteTable('commands', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  command: text('command').notNull(),
});

export const commandArguments = sqliteTable('command_arguments', {
  id: integer('id').primaryKey(),
  commandId: integer('command_id').notNull().references(() => commands.id),
  name: text('name').notNull(),
  value: text('value'),
  isFixed: integer('is_fixed', { mode: 'boolean' }).default(false),
});

export const commandsRelations = relations(commands, ({ many }) => ({
  args: many(commandArguments),
}));

export const commandArgumentsRelations = relations(commandArguments, ({ one }) => ({
  command: one(commands, {
    fields: [commandArguments.commandId],
    references: [commands.id],
  }),
}));
