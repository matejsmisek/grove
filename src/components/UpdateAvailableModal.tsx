import React, { useEffect, useRef, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { copyToClipboard } from '../utils/clipboard.js';
import { useUpdateStatus } from './UpdateStatusContext.js';

type CopyState = 'idle' | 'copying' | 'copied' | 'failed';

/** The npm package name Grove is published under. */
const PACKAGE_NAME = 'hypergrove';

/**
 * Full-screen "update available" modal shown on launch when a newer Grove
 * release is published. Notify-only — it never installs anything; it just shows
 * the exact upgrade command (matching `grove update`) and lets the user copy it
 * to the clipboard. Press Esc to dismiss, which snoozes the modal for 7 days
 * (unless an even newer version ships), handled by {@link UpdateStatusProvider}
 * via {@link useUpdateStatus}.
 *
 * Assumes it is only rendered while `showNotification` is true, so `latest` is
 * non-null.
 */
export function UpdateAvailableModal() {
	const { current, latest, dismissNotification } = useUpdateStatus();
	const [copyState, setCopyState] = useState<CopyState>('idle');

	// Guard against a resolved copy setting state after the modal is dismissed.
	const mounted = useRef(true);
	useEffect(() => {
		return () => {
			mounted.current = false;
		};
	}, []);

	const installCommand = `npm install -g ${PACKAGE_NAME}@${latest ?? 'latest'}`;

	useInput((_input, key) => {
		if (key.escape) {
			dismissNotification();
			return;
		}
		if (key.return && copyState !== 'copying') {
			setCopyState('copying');
			// Fire-and-forget: copyToClipboard never blocks or throws.
			void copyToClipboard(installCommand).then((ok) => {
				if (mounted.current) {
					setCopyState(ok ? 'copied' : 'failed');
				}
			});
		}
	});

	return (
		<Box flexGrow={1} alignItems="center" justifyContent="center" paddingY={1}>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="yellow"
				paddingX={2}
				paddingY={1}
				width={64}
			>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						🌳 Update available
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text>
						A newer version of Grove is available: <Text color="gray">v{current}</Text>
						<Text color="gray"> → </Text>
						<Text bold color="green">
							v{latest}
						</Text>
					</Text>
				</Box>
				<Box flexDirection="column" marginBottom={1}>
					<Text color="gray">To update, run:</Text>
					<Text color="cyan">{`  ${installCommand}`}</Text>
				</Box>
				{copyState !== 'idle' && (
					<Box marginBottom={1}>
						{copyState === 'copying' && <Text color="gray">Copying…</Text>}
						{copyState === 'copied' && <Text color="green">✓ Copied to clipboard</Text>}
						{copyState === 'failed' && (
							<Text color="red">✗ Could not copy (no clipboard tool found)</Text>
						)}
					</Box>
				)}
				<Text color="gray" dimColor>
					Press Enter to copy the command · Esc to dismiss (won&apos;t show again for 7 days)
				</Text>
			</Box>
		</Box>
	);
}
