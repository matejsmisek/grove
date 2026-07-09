import React from 'react';

import { Box, useStdout } from 'ink';

import type { GroveReference } from '../../storage/index.js';
import type { ClaudeAgentInfo } from '../../utils/claudeAgents.js';
import { wasLinkRecentlyOpened } from '../../utils/links.js';
import { AdoptWorktreePanel } from './AdoptWorktreePanel.js';
import { ClickableTile } from './ClickableTile.js';
import { CreateGrovePanel } from './CreateGrovePanel.js';
import { GrovePanel } from './GrovePanel.js';

type GroveGridProps = {
	groves: GroveReference[];
	selectedIndex: number;
	/** Live Claude sessions (interactive + background) from `claude agents --json`. */
	agentSessions: ClaudeAgentInfo[];
	/**
	 * Number of untracked (adoptable) worktrees. The Adopt Worktree tile is
	 * shown, with this count, only when it is greater than zero.
	 */
	adoptableCount?: number;
	/** Callback to notify parent of column count changes */
	onColumnsChange?: (columns: number) => void;
	/** Called with the flat item index on mouse-down (selects the tile) */
	onSelectItem?: (index: number) => void;
	/** Called with the flat item index on mouse-up (enters the tile) */
	onActivateItem?: (index: number) => void;
};

export function GroveGrid({
	groves,
	selectedIndex,
	agentSessions,
	adoptableCount = 0,
	onColumnsChange,
	onSelectItem,
	onActivateItem,
}: GroveGridProps) {
	const { stdout } = useStdout();
	const terminalWidth = stdout?.columns || 80; // Default to 80 if not available

	// Calculate responsive layout
	const MIN_PANEL_WIDTH = 48; // At least double the original 24
	const PANEL_MARGIN = 1; // Space between panels
	const CONTAINER_PADDING = 2; // Padding on left/right

	// Calculate how many panels can fit in the terminal width
	const availableWidth = terminalWidth - CONTAINER_PADDING;
	const panelWithMargin = MIN_PANEL_WIDTH + PANEL_MARGIN;
	const columns = Math.max(1, Math.floor((availableWidth + PANEL_MARGIN) / panelWithMargin));

	// Notify parent of column count changes
	React.useEffect(() => {
		if (onColumnsChange) {
			onColumnsChange(columns);
		}
	}, [columns, onColumnsChange]);

	// Action tiles precede the grove tiles: Create Grove, then (when there is
	// something to adopt) Adopt Worktree.
	const showAdoptTile = adoptableCount > 0;
	const actionTiles = showAdoptTile ? 2 : 1;
	const totalItems = actionTiles + groves.length;
	const rowCount = Math.ceil(totalItems / columns);

	return (
		<Box flexDirection="column">
			{Array.from({ length: rowCount }).map((_, rowIndex) => {
				const startIndex = rowIndex * columns;
				const items: React.ReactNode[] = [];

				for (let i = 0; i < columns; i++) {
					const itemIndex = startIndex + i;
					if (itemIndex >= totalItems) break;

					const isSelected = selectedIndex === itemIndex;
					const marginLeft = i > 0 ? PANEL_MARGIN : 0;

					if (itemIndex === 0) {
						// First item is always the Create Grove button
						items.push(
							<ClickableTile
								key="create"
								marginLeft={marginLeft}
								onPress={() => onSelectItem?.(itemIndex)}
								onRelease={() => onActivateItem?.(itemIndex)}
							>
								<CreateGrovePanel isSelected={isSelected} width={MIN_PANEL_WIDTH} />
							</ClickableTile>
						);
					} else if (showAdoptTile && itemIndex === 1) {
						// Second item is the Adopt Worktree button
						items.push(
							<ClickableTile
								key="adopt"
								marginLeft={marginLeft}
								onPress={() => onSelectItem?.(itemIndex)}
								onRelease={() => onActivateItem?.(itemIndex)}
							>
								<AdoptWorktreePanel
									isSelected={isSelected}
									count={adoptableCount}
									width={MIN_PANEL_WIDTH}
								/>
							</ClickableTile>
						);
					} else {
						// Remaining items are groves (offset by the action tiles)
						const grove = groves[itemIndex - actionTiles];
						if (grove) {
							items.push(
								<ClickableTile
									key={grove.id}
									marginLeft={marginLeft}
									onPress={() => onSelectItem?.(itemIndex)}
									onRelease={() => {
										// A click on the grove's MR link also fires this tile handler. Defer a
										// tick so the link can mark itself, then skip entering the grove if so.
										setTimeout(() => {
											if (wasLinkRecentlyOpened()) {
												return;
											}
											onActivateItem?.(itemIndex);
										}, 0);
									}}
								>
									<GrovePanel
										grove={grove}
										isSelected={isSelected}
										agentSessions={agentSessions}
										width={MIN_PANEL_WIDTH}
									/>
								</ClickableTile>
							);
						}
					}
				}

				return (
					<Box key={rowIndex} marginBottom={1}>
						{items}
					</Box>
				);
			})}
		</Box>
	);
}
