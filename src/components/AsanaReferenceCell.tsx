import React, { useRef } from 'react';

import { Box, type DOMElement, Text } from 'ink';

import { useOnRelease } from '@ink-tools/ink-mouse';

import { hyperlink, markLinkOpened, openUrl } from '../utils/links.js';

/**
 * Renders a worktree's external reference line:
 *   - Linked:   `Reference: Asana task`  — opens the task on click.
 *   - Unlinked: `Reference: Attach Asana` — starts the attach flow on click.
 *
 * Mirrors {@link MergeRequestCell}: the label is clickable via the mouse layer (and,
 * when linked, an OSC 8 hyperlink for Cmd/Ctrl-click). The containing tile's release
 * handler fires for the same click, so the cell marks it via {@link markLinkOpened}
 * so the tile can skip its own activation (opening the actions menu).
 */
export function AsanaReferenceCell({
	url,
	onAttach,
	marginLeft = 0,
}: {
	/** Task URL when linked; omit to render the unlinked "Attach Asana" affordance. */
	url?: string;
	/** Called when the unlinked affordance is clicked. */
	onAttach?: () => void;
	marginLeft?: number;
}) {
	const ref = useRef<DOMElement>(null);

	useOnRelease(ref, (event) => {
		if (event.button !== 'left') {
			return;
		}
		// Mark the click so the surrounding tile skips its own activation.
		markLinkOpened();
		if (url) {
			openUrl(url);
		} else {
			onAttach?.();
		}
	});

	return (
		<Box ref={ref} marginLeft={marginLeft}>
			<Text dimColor>Reference: </Text>
			{url ? (
				<Text color="cyan" underline>
					{hyperlink('Asana task', url)}
				</Text>
			) : (
				<Text color="cyan" underline>
					Attach Asana
				</Text>
			)}
		</Box>
	);
}
