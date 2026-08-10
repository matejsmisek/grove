import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { manageSkill } from '../commands/skill.js';
import { isClaudeCliAvailable, isPluginInstalled } from '../utils/claudePlugin.js';

interface SkillInstallPromptProps {
	/** Called once the prompt is resolved (installed, declined, or not applicable). */
	onComplete: () => void;
}

/**
 * Offers to install the Grove skill as a Claude Code plugin during setup.
 * Renders nothing and completes immediately when the `claude` CLI is missing or
 * the plugin is already installed. On accept, runs the install and shows the
 * result briefly before resolving.
 */
export function SkillInstallPrompt({ onComplete }: SkillInstallPromptProps) {
	// 'checking' until we know whether there's anything to offer.
	const [applicable, setApplicable] = useState<'checking' | 'yes' | 'no'>('checking');
	const [phase, setPhase] = useState<'asking' | 'installing' | 'done'>('asking');
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	// Probe once on mount: only applicable when Claude Code is present and the
	// plugin isn't already installed.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const claudeAvailable = await isClaudeCliAvailable();
			if (cancelled) {
				return;
			}
			const offer = claudeAvailable && !isPluginInstalled();
			setApplicable(offer ? 'yes' : 'no');
			if (!offer) {
				onComplete();
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Run the install once the user accepts. Deferred a tick so Ink paints the
	// "Installing…" state before the synchronous spawn blocks the thread.
	useEffect(() => {
		if (phase !== 'installing') {
			return;
		}
		const timer = setTimeout(() => {
			void manageSkill('install').then((result) => {
				setResultMessage(
					result.success
						? '✓ Grove skill installed (restart Claude Code to load it)'
						: `✗ ${result.message}`
				);
				setPhase('done');
				setTimeout(onComplete, 1000);
			});
		}, 0);
		return () => clearTimeout(timer);
	}, [phase]);

	useInput(
		(input, key) => {
			if (phase !== 'asking') {
				return;
			}
			if (input.toLowerCase() === 'y') {
				setPhase('installing');
			} else if (input.toLowerCase() === 'n' || key.escape) {
				onComplete();
			}
		},
		{ isActive: applicable === 'yes' && phase === 'asking' }
	);

	if (applicable !== 'yes') {
		return null;
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="yellow">
					🤖 Install the Grove Claude skill?
				</Text>
			</Box>
			<Box flexDirection="column" marginBottom={1}>
				<Text dimColor>
					Adds a Claude Code plugin that teaches Claude to orchestrate groves — create worktrees and
					launch parallel agents. It stays in sync when you update Grove.
				</Text>
			</Box>

			{phase === 'installing' ? (
				<Text color="cyan">Installing…</Text>
			) : resultMessage ? (
				<Text color={resultMessage.startsWith('✓') ? 'green' : 'red'}>{resultMessage}</Text>
			) : (
				<Text dimColor>
					<Text color="cyan">y</Text> Yes - <Text color="cyan">n</Text> No (skip)
				</Text>
			)}
		</Box>
	);
}
