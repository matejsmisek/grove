import React from 'react';

import { Box, useStdout } from 'ink';

import type { ISessionTrackingService } from '../../services/SessionTrackingService.js';
import type { GroveReference } from '../../storage/index.js';
import { ClickableTile } from './ClickableTile.js';
import { CreateGrovePanel } from './CreateGrovePanel.js';
import { GrovePanel } from './GrovePanel.js';

type GroveGridProps = {
	groves: GroveReference[];
	selectedIndex: number;
	sessionTrackingService: ISessionTrackingService;
	/** Used to trigger re-render when sessions are updated */
	refreshTick?: number;
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
	sessionTrackingService,
	refreshTick: _refreshTick,
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

	// Total items = 1 (create button) + groves.length
	const totalItems = 1 + groves.length;
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
					} else {
						// Remaining items are groves (offset by 1)
						const grove = groves[itemIndex - 1];
						if (grove) {
							// Get session counts for this grove
							const sessionCounts = sessionTrackingService.getGroveSessionCounts(grove.id);

							items.push(
								<ClickableTile
									key={grove.id}
									marginLeft={marginLeft}
									onPress={() => onSelectItem?.(itemIndex)}
									onRelease={() => onActivateItem?.(itemIndex)}
								>
									<GrovePanel
										grove={grove}
										isSelected={isSelected}
										sessionCounts={sessionCounts}
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
