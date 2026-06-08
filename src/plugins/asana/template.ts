/**
 * Asana "Instant Claude" prompt template.
 *
 * The "Launch instant Claude from Asana" worktree action seeds the prompt with a
 * template rendered from the linked Asana task. The template is freeform text that
 * may contain the variables listed in {@link ASANA_TEMPLATE_VARIABLES}; each token
 * is replaced with the matching task field before the text is handed to the
 * launch-time prompt template (where it fills the `{prompt}` placeholder).
 */
import type { AsanaTask } from './types.js';

/**
 * A template variable and the task field it resolves to. Exposed so the settings
 * UI can document the available tokens.
 */
export interface AsanaTemplateVariable {
	/** Literal token written in the template, e.g. `{task_name}`. */
	token: string;
	/** Human-readable description of what the token resolves to. */
	description: string;
}

/**
 * Variables supported inside the Asana instant-Claude template.
 */
export const ASANA_TEMPLATE_VARIABLES: readonly AsanaTemplateVariable[] = [
	{ token: '{task_name}', description: 'Task name/title' },
	{ token: '{task_description}', description: 'Task description (the Asana notes field)' },
	{ token: '{task_gid}', description: 'Task GID (global id)' },
	{ token: '{task_url}', description: 'Task permalink URL' },
	{ token: '{task_assignee}', description: "Assignee's display name (empty when unassigned)" },
] as const;

/**
 * Default template, used when the plugin has no `instantClaudeTemplate` configured.
 * Matches Grove's previous hardcoded behaviour.
 */
export const DEFAULT_ASANA_INSTANT_CLAUDE_TEMPLATE =
	'Task Name: {task_name}\n<description>{task_description}</description>';

/**
 * Render an Asana instant-Claude template by substituting every supported variable
 * with the matching field from `task`. Unknown tokens are left untouched; missing
 * fields resolve to an empty string.
 */
export function renderAsanaTemplate(template: string, task: AsanaTask): string {
	const values: Record<string, string> = {
		'{task_name}': task.name ?? '',
		'{task_description}': task.notes ?? '',
		'{task_gid}': task.gid ?? '',
		'{task_url}': task.url ?? '',
		'{task_assignee}': task.assignee ?? '',
	};

	return ASANA_TEMPLATE_VARIABLES.reduce(
		(acc, { token }) => acc.split(token).join(values[token] ?? ''),
		template
	);
}

/** Prefix marking a line as an editor comment in the instant-Claude template. */
const TEMPLATE_COMMENT_PREFIX = '#';

/**
 * Build the comment header prepended to the template when it is opened in the
 * editor. Documents the available variables; every line is a `#` comment that
 * {@link stripAsanaTemplateComments} removes on save.
 */
export function buildAsanaTemplateEditorHeader(): string {
	return [
		'# Instant Claude template — seeded from the linked Asana task.',
		'# Available variables:',
		...ASANA_TEMPLATE_VARIABLES.map(({ token, description }) => `#   ${token} — ${description}`),
		'#',
		'# Lines in this header starting with "#" are comments and are removed on save.',
		'# Keep the blank line below; leave the template empty to reset to the default.',
		'',
		'',
	].join('\n');
}

/**
 * Remove the leading comment header (the block produced by
 * {@link buildAsanaTemplateEditorHeader}) from edited template content, then trim
 * the blank separator lines that follow it.
 *
 * Only the leading run of `#` lines is stripped, so `#` markdown headings inside
 * the template body are preserved.
 */
export function stripAsanaTemplateComments(content: string): string {
	const lines = content.split('\n');
	let start = 0;
	while (start < lines.length && lines[start].trimStart().startsWith(TEMPLATE_COMMENT_PREFIX)) {
		start += 1;
	}
	while (start < lines.length && lines[start].trim() === '') {
		start += 1;
	}
	return lines.slice(start).join('\n');
}
