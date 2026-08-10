/**
 * Minimal interactive confirmation for destructive CLI commands.
 */
import * as readline from 'readline';

/**
 * Whether the CLI is attached to an interactive terminal. Non-interactive
 * callers (e.g. a Claude session or a piped invocation) must not be prompted;
 * they are expected to pass `--force` to proceed.
 */
export function isInteractive(): boolean {
	return Boolean(process.stdin.isTTY);
}

/**
 * Ask a yes/no question on the terminal. Defaults to "no" on empty input.
 * Only call when {@link isInteractive} is true.
 */
export async function confirmYesNo(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await new Promise<string>((resolve) => {
			rl.question(`${question} [y/N] `, resolve);
		});
		const normalized = answer.trim().toLowerCase();
		return normalized === 'y' || normalized === 'yes';
	} finally {
		rl.close();
	}
}
