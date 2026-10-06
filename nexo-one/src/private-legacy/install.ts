// MUST be the first import of the private entry: guards are in place before any legacy module evaluates.
import {installGuards} from './guards.ts';
import {runtimeHolder} from './state.ts';
export const guards = installGuards(window, runtimeHolder);
