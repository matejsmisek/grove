import React from 'react';

import { Box, Text, useApp, useInput, useStdin } from 'ink';

interface FatalConfigErrorProps {
	/** Short title describing what went wrong */
	title: string;
	/** Detailed, human-readable explanation */
	message: string;
	/** Optional hints on how to fix the problem */
	hints?: string[];
}

/**
 * Listens for any key press and unmounts the app. Rendered only in interactive
 * terminals; mounting useInput in a non-TTY context triggers Ink internals to
 * emit spurious warnings, so it is gated by the caller.
 */
function ExitOnKeyPress() {
	const { exit } = useApp();
	useInput(() => {
		exit();
	});
	return null;
}

/**
 * Full-screen, prominently bordered error shown when Grove cannot start due to
 * a configuration problem (e.g. an unusable global directory).
 *
 * In an interactive terminal it dismisses on any key press. In non-interactive
 * contexts (piped/scripted) Ink unmounts on stdin end so the caller can exit.
 */
export function FatalConfigError({ title, message, hints }: FatalConfigErrorProps) {
	const { isRawModeSupported } = useStdin();

	return (
		<Box flexDirection="column" height="100%" padding={1}>
			<Box flexDirection="column" borderStyle="double" borderColor="red" padding={1}>
				<Text bold color="red">
					✗ {title}
				</Text>
				<Box marginTop={1}>
					<Text>{message}</Text>
				</Box>
				{hints && hints.length > 0 && (
					<Box flexDirection="column" marginTop={1}>
						{hints.map((hint, index) => (
							<Text key={index} color="gray">
								• {hint}
							</Text>
						))}
					</Box>
				)}
				{isRawModeSupported && (
					<Box marginTop={1}>
						<Text dimColor>Press any key to exit.</Text>
					</Box>
				)}
			</Box>
			{isRawModeSupported && <ExitOnKeyPress />}
		</Box>
	);
}
