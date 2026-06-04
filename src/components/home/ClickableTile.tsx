import React, { useRef } from 'react';

import { Box, type DOMElement } from 'ink';

import { useOnPress, useOnRelease } from '@ink-tools/ink-mouse';

/**
 * Tile activation is a left-button gesture only. Right/other buttons are left
 * for global handlers (e.g. right-click = back), so we ignore them here.
 */
function isLeftButton(button: string): boolean {
	return button === 'left';
}

type ClickableTileProps = {
	/** Left margin applied to the tile (matches the grid's non-clickable spacing). */
	marginLeft?: number;
	/** Flex grow for the wrapper, when the tile should fill its row (e.g. list rows). */
	flexGrow?: number;
	/**
	 * Called on mouse button down over the tile. Mirrors arrow-key navigation:
	 * it should move the selection to this tile (without committing).
	 */
	onPress?: () => void;
	/**
	 * Called on mouse button up over the tile. Mirrors pressing Enter: it should
	 * commit the action (enter/open the tile).
	 */
	onRelease?: () => void;
	children: React.ReactNode;
};

/**
 * Wraps a grid tile so the mouse drives it in two phases: pressing selects the
 * tile (like arrow navigation) and releasing commits the action (like Enter).
 * Each tile gets its own ref + subscriptions (hooks can't run in a loop, so
 * this lives in a dedicated child component). Shared by the grove and workspace
 * grids.
 */
export function ClickableTile({
	marginLeft,
	flexGrow,
	onPress,
	onRelease,
	children,
}: ClickableTileProps) {
	const ref = useRef<DOMElement>(null);
	useOnPress(ref, onPress ? (event) => isLeftButton(event.button) && onPress() : undefined);
	useOnRelease(ref, onRelease ? (event) => isLeftButton(event.button) && onRelease() : undefined);

	return (
		<Box ref={ref} marginLeft={marginLeft} flexGrow={flexGrow}>
			{children}
		</Box>
	);
}
