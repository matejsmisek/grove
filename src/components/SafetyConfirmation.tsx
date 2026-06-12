import React, { useEffect, useRef, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from './GroveTextInput.js';

export type SafetyCheckStatus = 'ok' | 'warning' | 'error';

/** A single safety check line (e.g. "Uncommitted changes: ⚠ Yes"). */
export interface SafetyCheck {
	/** Left-hand label, e.g. "Uncommitted changes". */
	label: string;
	/** Drives the icon/color of the value. */
	status: SafetyCheckStatus;
	/** Right-hand value text, e.g. "Yes" / "No" / "Merged". */
	valueText: string;
}

/** A group of checks under a bold title (typically one worktree/repository). */
export interface SafetyCheckGroup {
	title: string;
	checks: SafetyCheck[];
}

export interface SafetyConfirmationProps {
	/** Header line for the screen. */
	title: string;
	/** Grouped safety checks rendered under "Safety Checks:". */
	groups: SafetyCheckGroup[];
	/** When true, the user must type "delete" to confirm; otherwise Y/N. */
	requireTypedConfirmation: boolean;
	/** Bold warning headline shown on the risky path. */
	warningTitle: string;
	/** Explanatory lines shown on the risky path. */
	warningBody: string[];
	/** Green summary line shown on the safe path. */
	safeSummary: string;
	/** Question shown on the safe path before the Y/N prompt. */
	confirmPrompt: string;
	/** Text shown while onConfirm is running. */
	processingMessage: string;
	/** Success line shown after a ✓; rendered as `✓ {successMessage}`. */
	successMessage: string;
	/** Runs the destructive action; throw to surface an error. */
	onConfirm: () => Promise<void>;
	/** Called when the user cancels (N / Esc). */
	onCancel: () => void;
	/** Called once the success screen is dismissed (auto after 2s or Enter). */
	onSuccess: () => void;
}

type Phase = 'confirm' | 'processing' | 'success' | 'error';

function statusColor(status: SafetyCheckStatus): string {
	switch (status) {
		case 'ok':
			return 'green';
		case 'warning':
			return 'yellow';
		case 'error':
			return 'red';
	}
}

function statusIcon(status: SafetyCheckStatus): string {
	switch (status) {
		case 'ok':
			return '✓';
		case 'warning':
			return '⚠';
		case 'error':
			return '✗';
	}
}

/**
 * Shared confirmation flow for destructive "close" actions. Owns the safety-check
 * display, the Y/N (safe) or type-"delete" (risky) confirmation input, and the
 * processing/success/error screens with auto-navigate on success. Callers supply
 * the checks and the destructive action via onConfirm.
 */
export function SafetyConfirmation({
	title,
	groups,
	requireTypedConfirmation,
	warningTitle,
	warningBody,
	safeSummary,
	confirmPrompt,
	processingMessage,
	successMessage,
	onConfirm,
	onCancel,
	onSuccess,
}: SafetyConfirmationProps) {
	const [phase, setPhase] = useState<Phase>('confirm');
	const [confirmationInput, setConfirmationInput] = useState('');
	const [errorMessage, setErrorMessage] = useState('');
	const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear the auto-navigate timer on unmount to prevent a stale onSuccess() call.
	useEffect(() => {
		return () => {
			if (autoTimer.current) {
				clearTimeout(autoTimer.current);
			}
		};
	}, []);

	const handleConfirm = async () => {
		if (requireTypedConfirmation && confirmationInput !== 'delete') {
			return;
		}

		setPhase('processing');

		try {
			await onConfirm();
			setPhase('success');
			// Auto-navigate after 2 seconds.
			autoTimer.current = setTimeout(() => {
				onSuccess();
			}, 2000);
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
			setPhase('error');
		}
	};

	// Risky path: ESC cancels while typing "delete".
	useInput(
		(_input, key) => {
			if (key.escape) {
				onCancel();
			}
		},
		{ isActive: phase === 'confirm' && requireTypedConfirmation }
	);

	// Safe path: Y confirms, N/Esc cancels.
	useInput(
		(input, key) => {
			if (input.toLowerCase() === 'y') {
				handleConfirm();
			} else if (input.toLowerCase() === 'n' || key.escape) {
				onCancel();
			}
		},
		{ isActive: phase === 'confirm' && !requireTypedConfirmation }
	);

	// Success screen: Enter dismisses immediately.
	useInput(
		(_input, key) => {
			if (key.return) {
				if (autoTimer.current) {
					clearTimeout(autoTimer.current);
					autoTimer.current = null;
				}
				onSuccess();
			}
		},
		{ isActive: phase === 'success' }
	);

	if (phase === 'processing') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>{processingMessage}</Text>
			</Box>
		);
	}

	if (phase === 'error') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">Error: {errorMessage}</Text>
				<Text dimColor>Press any key to go back</Text>
			</Box>
		);
	}

	if (phase === 'success') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text color="green" bold>
						✓ {successMessage}
					</Text>
				</Box>
				<Text dimColor>Press Enter to continue or wait to be redirected...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>{title}</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold underline>
					Safety Checks:
				</Text>
				{groups.map((group, groupIndex) => (
					<Box key={`${groupIndex}-${group.title}`} flexDirection="column" marginLeft={2} marginTop={1}>
						<Text bold>{group.title}</Text>
						{group.checks.map((check) => (
							<Box key={check.label} marginLeft={2}>
								<Text>
									{check.label}:{' '}
									<Text color={statusColor(check.status)}>
										{statusIcon(check.status)} {check.valueText}
									</Text>
								</Text>
							</Box>
						))}
					</Box>
				))}
			</Box>

			{requireTypedConfirmation ? (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text color="yellow" bold>
							{warningTitle}
						</Text>
					</Box>
					<Box marginBottom={1} flexDirection="column">
						{warningBody.map((line, index) => (
							<Text key={index}>{line}</Text>
						))}
					</Box>
					<Box flexDirection="column" marginBottom={1}>
						<Text bold>Type "delete" to confirm deletion:</Text>
						<TextInput
							value={confirmationInput}
							onChange={setConfirmationInput}
							onSubmit={handleConfirm}
						/>
					</Box>
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
			) : (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text color="green">{safeSummary}</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>{confirmPrompt}</Text>
					</Box>
					<Text>
						Press <Text bold>Y</Text> to confirm or <Text bold>N</Text> to cancel
					</Text>
				</Box>
			)}
		</Box>
	);
}
