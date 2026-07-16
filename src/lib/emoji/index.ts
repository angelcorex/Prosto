/**
 * Custom (server) emoji registry — a cross-cutting, client-side cache used by
 * the shared emoji UI primitives (picker, input, text, reactions) so a
 * `<:name:id>` token resolves to an image anywhere in the app.
 *
 * Lives in `lib` (not inside a feature) because emoji rendering is used
 * everywhere — posts, DMs, profiles and server channels alike. Import from
 * `@/lib/emoji` rather than reaching into `./store`.
 */
export * from './store';
