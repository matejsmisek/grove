import React from 'react';

import { Box, Text, useInput } from 'ink';

import { useUpdateStatus } from './UpdateStatusContext.js';

/** The npm package name Grove is published under. */
const PACKAGE_NAME = 'hypergrove';

/**
 * Full-screen "update available" modal shown on launch when a newer Grove
 * release is published. Notify-only — it never installs anything; it just shows
 * the exact upgrade command (matching `grove update`). Dismissing it snoozes the
 * modal for 7 days (unless an even newer version ships), handled by
 * {@link UpdateStatusProvider} via {@link useUpdateStatus}.
 *
 * Assumes it is only rendered while `showNotification` is true, so `latest` is
 * non-null.
 */
export function UpdateAvailableModal() {
	const { current, latest, dismissNotification } = useUpdateStatus();

	useInput((_input, _key) => {
		// Any key dismisses the modal and continues into the app.
		dismissNotification();
	});

	const installCommand = `npm install -g ${PACKAGE_NAME}@${latest ?? 'latest'}`;

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
				<Text color="gray" dimColor>
					Press any key to dismiss (won&apos;t show again for 7 days)
				</Text>
			</Box>
		</Box>
	);
}
