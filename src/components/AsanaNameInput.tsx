import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { isAsanaTaskUrl } from '../utils/index.js';
import TextInput from './GroveTextInput.js';

interface AsanaNameInputProps {
	/** Current field value */
	value: string;
	/** Called as the user types */
	onChange: (value: string) => void;
	/** Called when the user presses Enter while the text input is focused */
	onSubmit: (value: string) => void;
	/**
	 * Whether this field owns keyboard navigation (i.e. its step is active).
	 * When false, the input is not focused and arrow/Enter navigation is inert.
	 */
	isActive: boolean;
	/**
	 * Called when the user activates the "Create from Asana" button.
	 * Receives the trimmed field value (a recognized Asana task URL).
	 */
	onCreateFromAsana: (taskUrl: string) => void;
	/** Label shown before the input (e.g. "Name: ") */
	label?: string;
	/** Placeholder shown when the input is empty */
	placeholder?: string;
	/** Whether an Asana fetch is in progress (disables input, shows busy label) */
	busy?: boolean;
	/** Label shown on the button while busy */
	busyLabel?: string;
	/** Label shown on the button when idle */
	buttonLabel?: string;
	/**
	 * Label for the "proceed anyway" option in the confirmation modal that appears
	 * when the user presses Enter on an Asana URL without choosing "Create from Asana".
	 * Defaults to describing the value being used verbatim as the name.
	 */
	continueLabel?: string;
	/**
	 * Notifies the parent when the confirmation modal opens/closes so it can gate its
	 * own Esc handling (Ink dispatches keys to every active input, so an ungated parent
	 * would also act on the Esc that dismisses the modal).
	 */
	onConfirmOpenChange?: (open: boolean) => void;
}

/**
 * Name entry field with a focus-highlighted border that, when the value looks
 * like an Asana task URL, reveals a "Create from Asana" button below it.
 *
 * Keyboard model:
 *   - While the input is focused, ↓ moves focus to the button (only when shown).
 *   - While the button is focused, ↑ returns focus to the input and Enter
 *     activates it. The text input is unfocused so typing/Enter do not fire.
 *
 * Escape and other step transitions remain the parent screen's responsibility.
 */
export function AsanaNameInput({
	value,
	onChange,
	onSubmit,
	isActive,
	onCreateFromAsana,
	label,
	placeholder,
	busy = false,
	busyLabel = 'Fetching Asana task…',
	buttonLabel = 'Create from Asana',
	continueLabel = 'Use the URL as the name',
	onConfirmOpenChange,
}: AsanaNameInputProps) {
	const [focusTarget, setFocusTarget] = useState<'input' | 'button'>('input');
	// When the user presses Enter on an Asana URL without choosing the button, we ask
	// them to confirm rather than silently using the URL verbatim. `confirmChoice` is
	// 0 = "Create from Asana" (default), 1 = proceed with the value as-is.
	const [confirming, setConfirming] = useState(false);
	const [confirmChoice, setConfirmChoice] = useState<0 | 1>(0);

	const showButton = isAsanaTaskUrl(value);

	// If the URL is edited away (button hidden) or the step is deactivated, the
	// button can no longer hold focus — fall back to the input, and any open
	// confirmation is no longer relevant.
	useEffect(() => {
		if ((!showButton || !isActive) && focusTarget === 'button') {
			setFocusTarget('input');
		}
		if ((!showButton || !isActive) && confirming) {
			setConfirming(false);
		}
	}, [showButton, isActive, focusTarget, confirming]);

	// Keep the parent informed so it can suspend its own Esc handling while the modal
	// is open (Ink dispatches each key to every active input).
	useEffect(() => {
		onConfirmOpenChange?.(confirming);
	}, [confirming, onConfirmOpenChange]);

	// The text input must not stay focused while the modal is open, or Enter/typing
	// would leak through to it.
	const inputFocused = isActive && !busy && !confirming && focusTarget === 'input';
	const buttonFocused = focusTarget === 'button';

	// Called when Enter is pressed inside the text input. If the value is an Asana URL,
	// intercept and confirm intent instead of proceeding with the URL as the name.
	const handleInputSubmit = (submitted: string) => {
		if (showButton) {
			setConfirmChoice(0);
			setConfirming(true);
			return;
		}
		onSubmit(submitted);
	};

	useInput(
		(_input, key) => {
			if (busy) {
				return;
			}

			if (confirming) {
				if (key.upArrow || key.downArrow) {
					setConfirmChoice((prev) => (prev === 0 ? 1 : 0));
				} else if (key.return) {
					setConfirming(false);
					if (confirmChoice === 0) {
						onCreateFromAsana(value.trim());
					} else {
						onSubmit(value);
					}
				} else if (key.escape) {
					// Dismiss the modal and return to editing (the parent's Esc handler is
					// gated via onConfirmOpenChange, so this does not also leave the screen).
					setConfirming(false);
				}
				return;
			}

			if (focusTarget === 'input') {
				if (key.downArrow && showButton) {
					setFocusTarget('button');
				}
				return;
			}

			// focusTarget === 'button'
			if (key.upArrow) {
				setFocusTarget('input');
			} else if (key.return) {
				onCreateFromAsana(value.trim());
			}
		},
		{ isActive: isActive && (confirming || showButton || focusTarget === 'button') }
	);

	return (
		<Box flexDirection="column" width="100%">
			{/* Input spans the full available width of the screen. */}
			<Box borderStyle="round" borderColor={inputFocused ? 'cyan' : 'gray'} paddingX={1} width="100%">
				{label && <Text color={inputFocused ? 'cyan' : undefined}>{label}</Text>}
				<Box flexGrow={1}>
					<TextInput
						value={value}
						onChange={onChange}
						onSubmit={handleInputSubmit}
						focus={inputFocused}
						placeholder={placeholder}
					/>
				</Box>
			</Box>

			{confirming ? (
				<Box
					flexDirection="column"
					marginTop={1}
					borderStyle="round"
					borderColor="yellow"
					paddingX={2}
					paddingY={1}
				>
					<Box marginBottom={1}>
						<Text color="yellow" bold>
							⚠ This looks like an Asana task URL
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>You pressed Enter without choosing "{buttonLabel}". What would you like to do?</Text>
					</Box>
					{[buttonLabel, continueLabel].map((label, index) => (
						<Box key={index}>
							<Text color={confirmChoice === index ? 'cyan' : undefined} bold={confirmChoice === index}>
								{confirmChoice === index ? '❯ ' : '  '}
								{label}
							</Text>
						</Box>
					))}
					<Box marginTop={1}>
						<Text dimColor>↑/↓ to choose · Enter to confirm · Esc to keep editing</Text>
					</Box>
				</Box>
			) : (
				showButton && (
					<Box flexDirection="column" marginTop={1}>
						{/* Button styled like a grove tile: round border, padded, bold label. */}
						<Box
							borderStyle="round"
							borderColor={buttonFocused ? 'cyan' : 'gray'}
							paddingX={2}
							paddingY={1}
							alignSelf="flex-start"
							alignItems="center"
						>
							<Text bold color={buttonFocused ? 'cyan' : 'green'}>
								{busy ? busyLabel : buttonLabel}
							</Text>
						</Box>
						{!busy && (
							<Box marginTop={1}>
								<Text dimColor>
									{focusTarget === 'input'
										? 'Press ↓ to use the Asana task name'
										: 'Press Enter to fetch · ↑ to edit'}
								</Text>
							</Box>
						)}
					</Box>
				)
			)}
		</Box>
	);
}
