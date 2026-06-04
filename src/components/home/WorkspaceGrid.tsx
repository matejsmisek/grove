import React from 'react';

import { Box, useStdout } from 'ink';

import { ClickableTile } from './ClickableTile.js';
import { WorkspacePanel } from './WorkspacePanel.js';

export type WorkspaceGridItem = {
	name: string;
	kind: 'workspace' | 'repo';
	path: string;
	groveCount: number;
};

type WorkspaceGridProps = {
	items: WorkspaceGridItem[];
	selectedIndex: number;
	/** Callback to notify parent of column count changes */
	onColumnsChange?: (columns: number) => void;
	/** Called with the item index on mouse-down (selects the tile) */
	onSelectItem?: (index: number) => void;
	/** Called with the item index on mouse-up (opens the tile) */
	onActivateItem?: (index: number) => void;
};

/**
 * Responsive grid of workspace/repo tiles for the global switcher. Mirrors the
 * layout of GroveGrid so the two screens feel consistent.
 */
export function WorkspaceGrid({
	items,
	selectedIndex,
	onColumnsChange,
	onSelectItem,
	onActivateItem,
}: WorkspaceGridProps) {
	const { stdout } = useStdout();
	const terminalWidth = stdout?.columns || 80;

	const MIN_PANEL_WIDTH = 48;
	const PANEL_MARGIN = 1;
	const CONTAINER_PADDING = 2;

	const availableWidth = terminalWidth - CONTAINER_PADDING;
	const panelWithMargin = MIN_PANEL_WIDTH + PANEL_MARGIN;
	const columns = Math.max(1, Math.floor((availableWidth + PANEL_MARGIN) / panelWithMargin));

	React.useEffect(() => {
		if (onColumnsChange) {
			onColumnsChange(columns);
		}
	}, [columns, onColumnsChange]);

	const rowCount = Math.ceil(items.length / columns);

	return (
		<Box flexDirection="column">
			{Array.from({ length: rowCount }).map((_, rowIndex) => {
				const startIndex = rowIndex * columns;
				const cells: React.ReactNode[] = [];

				for (let i = 0; i < columns; i++) {
					const itemIndex = startIndex + i;
					if (itemIndex >= items.length) break;

					const item = items[itemIndex];
					const marginLeft = i > 0 ? PANEL_MARGIN : 0;

					cells.push(
						<ClickableTile
							key={itemIndex}
							marginLeft={marginLeft}
							onPress={() => onSelectItem?.(itemIndex)}
							onRelease={() => onActivateItem?.(itemIndex)}
						>
							<WorkspacePanel
								name={item.name}
								kind={item.kind}
								path={item.path}
								groveCount={item.groveCount}
								isSelected={selectedIndex === itemIndex}
								width={MIN_PANEL_WIDTH}
							/>
						</ClickableTile>
					);
				}

				return (
					<Box key={rowIndex} marginBottom={1}>
						{cells}
					</Box>
				);
			})}
		</Box>
	);
}
