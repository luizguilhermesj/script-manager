CREATE TABLE `command_arguments` (
	`id` integer PRIMARY KEY NOT NULL,
	`command_id` integer NOT NULL,
	`name` text NOT NULL,
	`value` text,
	`is_fixed` integer DEFAULT false,
	FOREIGN KEY (`command_id`) REFERENCES `commands`(`id`) ON UPDATE no action ON DELETE no action
);
