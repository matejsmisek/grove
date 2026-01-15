import React, { useCallback, useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

export interface MultiLineTextInputProps {
	/** Current value of the text input */
	value: string;
	/** Called when value changes */
	onChange: (value: string) => void;
	/** Called when Enter is pressed with Ctrl or Cmd */
	onSubmit?: () => void;
	/** Called when Escape is pressed */
	onCancel?: () => void;
	/** Whether the input is active and should handle key presses */
	isActive?: boolean;
	/** Placeholder text when empty */
	placeholder?: string;
	/** Maximum visible lines (will scroll if content exceeds) */
	maxVisibleLines?: number;
	/** Show line numbers */
	showLineNumbers?: boolean;
	/** Custom cursor character */
	cursorChar?: string;
}

interface CursorPosition {
	line: number;
	column: number;
}

/**
 * Multi-line text input component with 2D cursor navigation
 *
 * Controls:
 * - Arrow keys: Move cursor in 2D
 * - Home/End: Move to start/end of line
 * - Ctrl+Home/End: Move to start/end of document
 * - Ctrl+Enter: Submit
 * - Escape: Cancel
 * - Backspace: Delete character before cursor
 * - Delete: Delete character at cursor
 * - Any printable character: Insert at cursor
 * - Enter: Insert new line
 */
export function MultiLineTextInput({
	value,
	onChange,
	onSubmit,
	onCancel,
	isActive = true,
	placeholder = '',
	maxVisibleLines = 10,
	showLineNumbers = false,
	cursorChar = '|',
}: MultiLineTextInputProps) {
	const lines = value.split('\n');
	const [cursor, setCursor] = useState<CursorPosition>({ line: 0, column: 0 });
	const [scrollOffset, setScrollOffset] = useState(0);

	// Ensure cursor stays within bounds when value changes
	useEffect(() => {
		const currentLines = value.split('\n');
		setCursor((prev) => {
			const maxLine = Math.max(0, currentLines.length - 1);
			const line = Math.min(prev.line, maxLine);
			const maxColumn = currentLines[line]?.length ?? 0;
			const column = Math.min(prev.column, maxColumn);
			return { line, column };
		});
	}, [value]);

	// Adjust scroll to keep cursor visible
	useEffect(() => {
		if (cursor.line < scrollOffset) {
			setScrollOffset(cursor.line);
		} else if (cursor.line >= scrollOffset + maxVisibleLines) {
			setScrollOffset(cursor.line - maxVisibleLines + 1);
		}
	}, [cursor.line, scrollOffset, maxVisibleLines]);

	const moveCursor = useCallback(
		(deltaLine: number, deltaColumn: number) => {
			setCursor((prev) => {
				let newLine = prev.line + deltaLine;
				let newColumn = prev.column + deltaColumn;

				// Clamp line
				newLine = Math.max(0, Math.min(newLine, lines.length - 1));

				// Get the target line's length
				const lineLength = lines[newLine]?.length ?? 0;

				// When moving vertically, try to maintain column position
				if (deltaLine !== 0 && deltaColumn === 0) {
					newColumn = Math.min(prev.column, lineLength);
				} else {
					// Clamp column
					newColumn = Math.max(0, Math.min(newColumn, lineLength));
				}

				return { line: newLine, column: newColumn };
			});
		},
		[lines]
	);

	const insertText = useCallback(
		(text: string) => {
			const beforeCursor = lines
				.slice(0, cursor.line)
				.concat([lines[cursor.line].slice(0, cursor.column)])
				.join('\n');
			const afterCursor = [lines[cursor.line].slice(cursor.column)]
				.concat(lines.slice(cursor.line + 1))
				.join('\n');

			const newValue = beforeCursor + text + afterCursor;
			onChange(newValue);

			// Move cursor after inserted text
			const insertedLines = text.split('\n');
			if (insertedLines.length === 1) {
				setCursor((prev) => ({ ...prev, column: prev.column + text.length }));
			} else {
				setCursor({
					line: cursor.line + insertedLines.length - 1,
					column: insertedLines[insertedLines.length - 1].length,
				});
			}
		},
		[lines, cursor, onChange]
	);

	const deleteChar = useCallback(
		(forward: boolean) => {
			if (forward) {
				// Delete character at cursor
				if (cursor.column < lines[cursor.line].length) {
					// Delete character in current line
					const line = lines[cursor.line];
					const newLine = line.slice(0, cursor.column) + line.slice(cursor.column + 1);
					const newLines = [...lines];
					newLines[cursor.line] = newLine;
					onChange(newLines.join('\n'));
				} else if (cursor.line < lines.length - 1) {
					// Join with next line
					const newLines = [...lines];
					newLines[cursor.line] = lines[cursor.line] + lines[cursor.line + 1];
					newLines.splice(cursor.line + 1, 1);
					onChange(newLines.join('\n'));
				}
			} else {
				// Backspace - delete character before cursor
				if (cursor.column > 0) {
					// Delete character before cursor in current line
					const line = lines[cursor.line];
					const newLine = line.slice(0, cursor.column - 1) + line.slice(cursor.column);
					const newLines = [...lines];
					newLines[cursor.line] = newLine;
					onChange(newLines.join('\n'));
					setCursor((prev) => ({ ...prev, column: prev.column - 1 }));
				} else if (cursor.line > 0) {
					// Join with previous line
					const prevLineLength = lines[cursor.line - 1].length;
					const newLines = [...lines];
					newLines[cursor.line - 1] = lines[cursor.line - 1] + lines[cursor.line];
					newLines.splice(cursor.line, 1);
					onChange(newLines.join('\n'));
					setCursor({ line: cursor.line - 1, column: prevLineLength });
				}
			}
		},
		[lines, cursor, onChange]
	);

	useInput(
		(input, key) => {
			// Backspace - check first as terminals send different codes
			// \x7f (DEL, 127), \b (BS, 8), or key.backspace flag
			if (key.backspace || input === '\x7f' || input === '\b' || input === '\x08') {
				deleteChar(false);
				return;
			}

			// Delete key
			if (key.delete) {
				deleteChar(true);
				return;
			}

			// Navigation
			if (key.upArrow) {
				moveCursor(-1, 0);
			} else if (key.downArrow) {
				moveCursor(1, 0);
			} else if (key.leftArrow) {
				if (key.ctrl || key.meta) {
					// Move to start of line
					setCursor((prev) => ({ ...prev, column: 0 }));
				} else {
					moveCursor(0, -1);
				}
			} else if (key.rightArrow) {
				if (key.ctrl || key.meta) {
					// Move to end of line
					setCursor((prev) => ({ ...prev, column: lines[prev.line]?.length ?? 0 }));
				} else {
					moveCursor(0, 1);
				}
			} else if (input === 'a' && key.ctrl) {
				// Ctrl+A: Move to start of document
				setCursor({ line: 0, column: 0 });
			} else if (input === 'e' && key.ctrl) {
				// Ctrl+E: Move to end of document
				const lastLine = lines.length - 1;
				setCursor({ line: lastLine, column: lines[lastLine]?.length ?? 0 });
			} else if (key.pageUp) {
				// Page up - move up by maxVisibleLines
				moveCursor(-maxVisibleLines, 0);
			} else if (key.pageDown) {
				// Page down - move down by maxVisibleLines
				moveCursor(maxVisibleLines, 0);
			} else if (input === 's' && key.ctrl) {
				// Ctrl+S: Submit/Save
				onSubmit?.();
			} else if (key.return) {
				// Enter: Insert newline
				insertText('\n');
			} else if (key.escape) {
				onCancel?.();
			} else if (input && !key.ctrl && !key.meta) {
				// Insert printable character
				insertText(input);
			}
		},
		{ isActive }
	);

	// Calculate visible lines
	const visibleLines = lines.slice(scrollOffset, scrollOffset + maxVisibleLines);
	const lineNumberWidth = showLineNumbers ? String(lines.length).length + 1 : 0;

	// Show placeholder when empty
	if (value === '' && placeholder) {
		return (
			<Box flexDirection="column">
				<Text dimColor>
					{cursorChar}
					{placeholder}
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{visibleLines.map((line, index) => {
				const actualLineNumber = scrollOffset + index;
				const isCursorLine = actualLineNumber === cursor.line;

				// Render line with cursor
				let renderedLine: React.ReactNode;
				if (isCursorLine && isActive) {
					const beforeCursor = line.slice(0, cursor.column);
					const atCursor = line[cursor.column] || ' ';
					const afterCursor = line.slice(cursor.column + 1);

					renderedLine = (
						<Text>
							{beforeCursor}
							<Text inverse>{atCursor}</Text>
							{afterCursor}
						</Text>
					);
				} else {
					renderedLine = <Text>{line || ' '}</Text>;
				}

				return (
					<Box key={actualLineNumber}>
						{showLineNumbers && (
							<Text dimColor>{String(actualLineNumber + 1).padStart(lineNumberWidth, ' ')} </Text>
						)}
						{renderedLine}
					</Box>
				);
			})}

			{/* Scroll indicator */}
			{lines.length > maxVisibleLines && (
				<Box marginTop={1}>
					<Text dimColor>
						Lines {scrollOffset + 1}-{Math.min(scrollOffset + maxVisibleLines, lines.length)} of{' '}
						{lines.length}
					</Text>
				</Box>
			)}

			{/* Help text */}
			<Box marginTop={1}>
				<Text dimColor>
					<Text color="cyan">Arrows</Text> Move | <Text color="cyan">Ctrl+S</Text> Save |{' '}
					<Text color="cyan">Esc</Text> Cancel
				</Text>
			</Box>
		</Box>
	);
}
