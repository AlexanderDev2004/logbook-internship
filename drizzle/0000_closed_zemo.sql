CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`clock_in` text NOT NULL,
	`clock_out` text NOT NULL,
	`activity` text NOT NULL,
	`ai_refined` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`student_name` text NOT NULL,
	`student_nim` text NOT NULL,
	`study_program` text NOT NULL,
	`partner_name` text NOT NULL,
	`logo_png` text NOT NULL,
	`institution_lines` text NOT NULL,
	`sub_lines` text NOT NULL,
	`title_lines` text NOT NULL,
	`font_heading` text DEFAULT 'Times New Roman' NOT NULL,
	`font_body` text DEFAULT 'Calibri' NOT NULL,
	`field_supervisor_name` text NOT NULL,
	`academic_advisor_name` text NOT NULL,
	`student_signature_png` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signatures` (
	`week_id` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`signer_name` text,
	`signature_png` text,
	`signed_at` text,
	PRIMARY KEY(`week_id`, `role`),
	FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signatures_token_unique` ON `signatures` (`token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`created_at` text NOT NULL
);
