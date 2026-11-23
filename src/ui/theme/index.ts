/**
 * Design-system constants for TypeScript. The stylesheets are imported once by the app root, in
 * this order:
 *
 *   import "./ui/theme/fonts.css";
 *   import "./ui/theme/tokens.css";
 *   import "./ui/theme/base.css";
 *
 * Spec: docs/design/ui-spec.md §2 (tokens), §3 (layout), §9 (motion).
 */
export * from "./motion";
export * from "./layout";
export * from "./contrast";
