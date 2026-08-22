//#region lib/types/invariant.js
/**
 * Package-owned invariant companion for `@dsh-plugins/design-blueprint`.
 * @module @dsh-plugins/design-blueprint/invariant
 */
const PACKAGE_NAME = "@dsh-plugins/design-blueprint";
/** Cordis companion plugin name. */
const name = "design-blueprint-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
 * No runtime invariant is retained. Prompt and command registrations are
 * already owned Cordis effects, while each compliance scan reads a fresh
 * workspace snapshot and therefore has no host state to validate here.
 */
const install = () => {};
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
