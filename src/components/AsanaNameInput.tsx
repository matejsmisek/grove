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
}: AsanaNameInputProps) {
	const [focusTarget, setFocusTarget] = useState<'input' | 'button'>('input');

	const showButton = isAsanaTaskUrl(value);

	// If the URL is edited away (button hidden) or the step is deactivated, the
	// button can no longer hold focus — fall back to the input.
	useEffect(() => {
		if ((!showButton || !isActive) && focusTarget === 'button') {
			setFocusTarget('input');
		}
	}, [showButton, isActive, focusTarget]);

	const inputFocused = isActive && !busy && focusTarget === 'input';
	const buttonFocused = focusTarget === 'button';

	useInput(
		(_input, key) => {
			if (busy) {
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
		{ isActive: isActive && (showButton || focusTarget === 'button') }
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
						onSubmit={onSubmit}
						focus={inputFocused}
						placeholder={placeholder}
					/>
				</Box>
			</Box>

			{showButton && (
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
			)}
		</Box>
	);
}
