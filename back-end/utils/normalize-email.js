// Puts an email address into one standard form, so that "Ada@Example.com "
// and "ada@example.com" are treated as the same account.
// Used by registration, login and account updates, so they always agree.
//
// It's an "arrow function": `(email) => ...` takes an email and returns the
// value after the arrow.
//   .trim()        removes spaces (and tabs/newlines) from both ends
//   .toLowerCase() turns every letter into lower case
// The two are "chained": trim() returns a new string, then toLowerCase() runs on that.
// So "  Ada@Example.COM " becomes "ada@example.com".
export const normalizeEmail = (email) => email.trim().toLowerCase();
