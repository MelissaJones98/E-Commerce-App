// Puts an email address into one standard form, so "Ada@Example.com " and
// "ada@example.com" are treated as the same account. Used by both
// registration and login so they always agree.
export const normalizeEmail = (email) => email.trim().toLowerCase();
