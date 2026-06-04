import React, { useEffect } from 'react';

import TextInput, { type Props } from 'ink-text-input';

import { useTextInputActivity } from './TextInputActivityContext.js';

/**
 * Drop-in replacement for ink-text-input that reports to the app while it is
 * focused, so the app can pause mouse capture and the right-click→Esc gesture.
 * Without this, a synthesized Esc (or intercepted clicks) would corrupt the
 * text the user is typing (e.g. a new grove name or description).
 */
export default function GroveTextInput(props: Props) {
	const { register, unregister } = useTextInputActivity();
	// `focus` defaults to true in ink-text-input, so undefined counts as active.
	const active = props.focus !== false;

	useEffect(() => {
		if (!active) {
			return;
		}
		register();
		return () => unregister();
	}, [active, register, unregister]);

	return <TextInput {...props} />;
}
