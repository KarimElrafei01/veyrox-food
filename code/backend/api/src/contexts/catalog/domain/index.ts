// The catalog context's public face (ADR-0019). Catalog is CRUD with versioning —
// menu, modifiers, prices, recipes, availability. No aggregate root: the invariant
// that matters (a published menu is immutable for a session) lives in the menu_versions
// tables, not in a domain object (ADR-0017). Published events and shared types land here
// when another context needs them; today there are none.
export {};
