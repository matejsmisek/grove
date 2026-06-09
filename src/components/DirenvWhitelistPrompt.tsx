import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { isDirenvAvailable } from '../utils/direnv.js';
import { addDirenvWhitelistPrefix, isPathInDirenvWhitelist } from '../utils/direnvWhitelist.js';

interface DirenvWhitelistPromptProps {
	/** The groves folder to offer for the direnv whitelist. */
	folder: string;
	/**
	 * A previous groves folder to drop from the whitelist when the user accepts —
	 * passed when the folder is being changed so the old prefix does not linger.
	 */
	previousFolder?: string;
	/** Called once the prompt is resolved (accepted, declined, or not applicable). */
	onComplete: () => void;
}

/**
 * Offers to add the groves folder to direnv's `[whitelist].prefix` so every
 * worktree created beneath it loads its `.envrc`/`.env` without a manual
 * `direnv allow`. Renders nothing and completes immediately when direnv is not
 * installed or the folder is already whitelisted.
 */
export function DirenvWhitelistPrompt({
	folder,
	previousFolder,
	onComplete,
}: DirenvWhitelistPromptProps) {
	const trimmedFolder = folder.trim();
	const [phase, setPhase] = useState<'asking' | 'done'>('asking');
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	// Skip entirely when there is nothing to offer.
	const applicable =
		trimmedFolder.length > 0 && isDirenvAvailable() && !isPathInDirenvWhitelist(trimmedFolder);

	// Nothing to offer (direnv missing or folder already trusted) — resolve at once.
	useEffect(() => {
		if (!applicable) {
			onComplete();
		}
	}, [applicable]);

	useInput(
		(input, key) => {
			if (phase !== 'asking') {
				return;
			}

			if (input.toLowerCase() === 'y') {
				try {
					const remove =
						previousFolder && previousFolder.trim() !== trimmedFolder ? previousFolder.trim() : undefined;
					addDirenvWhitelistPrefix(trimmedFolder, remove);
					setResultMessage(`✓ Added to direnv whitelist: ${trimmedFolder}`);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					setResultMessage(`Could not update direnv config: ${message}`);
				}
				setPhase('done');
				setTimeout(onComplete, 700);
			} else if (input.toLowerCase() === 'n' || key.escape) {
				onComplete();
			}
		},
		{ isActive: applicable }
	);

	if (!applicable) {
		return null;
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="yellow">
					🔐 Trust this folder in direnv?
				</Text>
			</Box>
			<Box flexDirection="column" marginBottom={1}>
				<Text dimColor>
					direnv is installed. Adding the groves folder to its whitelist lets every worktree's
					<Text> </Text>
					<Text color="cyan">.envrc</Text> load automatically — no manual{' '}
					<Text color="cyan">direnv allow</Text> per worktree.
				</Text>
				<Box marginTop={1}>
					<Text>
						Whitelist <Text color="cyan">{trimmedFolder}</Text>?
					</Text>
				</Box>
			</Box>

			{resultMessage ? (
				<Text color="green">{resultMessage}</Text>
			) : (
				<Text dimColor>
					<Text color="cyan">y</Text> Yes - <Text color="cyan">n</Text> No (skip)
				</Text>
			)}
		</Box>
	);
}
