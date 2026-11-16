/**
 * Names the Emitted_Project Shim provides. Pure data: this file must not
 * import from the Shim. The list is generated from the exports of
 * `template/shim/index.ts` by `npm run gen:shim-members` (design D1).
 */
import { SHIM_EXPORT_NAMES } from './shimMembers.generated';

/** Names exported by the Shim; imported from '../shim' in translated code. */
export const SHIM_AS3_NAMES: ReadonlySet<string> = new Set(SHIM_EXPORT_NAMES);
