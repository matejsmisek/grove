import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

import { buildClaudePromptLaunchScript } from '../launchScript.js';

describe('buildClaudePromptLaunchScript', () => {
	it('produces a bash script that launches a named interactive claude session', () => {
		const script = buildClaudePromptLaunchScript('my-grove/frontend', 'Do the thing');

		expect(script.startsWith('#!/usr/bin/env bash\n')).toBe(true);
		expect(script).toContain("exec claude --name 'my-grove/frontend'");
		// The prompt is delivered via a quoted heredoc (no expansion inside).
		expect(script).toMatch(/"\$\(cat <<'GROVE_PROMPT_[0-9a-f]+'/);
		expect(script).toContain('Do the thing');
	});

	it('single-quotes a session name containing an apostrophe', () => {
		const script = buildClaudePromptLaunchScript("bob's grove", 'hi');
		expect(script).toContain("exec claude --name 'bob'\\''s grove'");
	});

	it('opens and closes the heredoc with the same delimiter exactly twice', () => {
		const script = buildClaudePromptLaunchScript('name', 'body');
		const delimiter = script.match(/<<'(GROVE_PROMPT_[0-9a-f]+)'/)?.[1];
		expect(delimiter).toBeTruthy();
		const occurrences = script.split(delimiter!).length - 1;
		// Once on the opening `<<'DELIM'` line, once on the closing line.
		expect(occurrences).toBe(2);
	});

	it('is syntactically valid bash', () => {
		const script = buildClaudePromptLaunchScript(
			'grove/wt',
			'Line "one"\nLine \'two\' with $VAR and `backticks`\n\tindented'
		);
		// `bash -n` parses without executing; throws on a syntax error.
		expect(() => execFileSync('bash', ['-n', '-c', script])).not.toThrow();
	});

	it('delivers a hostile multi-line prompt to the launched command verbatim', () => {
		const prompt = [
			'Line one with "double" and \'single\' quotes',
			'Second line with $VAR and `backticks` and \\ backslash',
			'\ttabbed line',
		].join('\n');

		// Replace the `exec claude ...` invocation with a printf that echoes the args,
		// so we can assert what claude would have received.
		const script = buildClaudePromptLaunchScript('grove/wt', prompt).replace(
			'exec claude --name',
			"exec printf '%s\\n' --name"
		);
		const output = execFileSync('bash', ['-c', script]).toString();

		expect(output).toContain('grove/wt');
		expect(output).toContain(prompt);
	});
});
