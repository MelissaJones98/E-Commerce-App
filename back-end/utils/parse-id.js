// Helpers for ids that arrive in URLs, e.g. the 7 in /products/7 or the 3 in
// /products?category=3. Values from a URL are always strings, so they need
// checking and converting to numbers before they're used in a query.

// The largest value a PostgreSQL `integer` column can hold (2^31 - 1).
// A bigger number would make the query fail with a database error, so ids are
// checked against this first. `export` lets other files import it.
export const MAX_INTEGER = 2147483647;

// Converts an id from a URL to a number.
// Returns the number if it's a whole number from 1 to MAX_INTEGER, otherwise
// null, so values like "abc", "1.5", "0", "-1" and "007" are rejected before
// reaching the database.
export const parseId = (value) => {
  // The regular expression /^[1-9]\d*$/ describes a valid id:
  //   ^       start of the text
  //   [1-9]   a first digit from 1 to 9 (so no "0" and no leading zeros)
  //   \d*     followed by any number of digits (0-9), including none
  //   $       end of the text
  // So "7" and "42" match, but "abc", "1.5", "-1" and "0" don't.
  // `||` means "or": return null if it isn't a string OR doesn't match.
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;

  // Number() converts the text to a number, e.g. "42" becomes 42.
  const id = Number(value);

  // The "ternary" operator `condition ? a : b` gives `a` if the condition is
  // true, otherwise `b`. So: the id if it fits in an integer column, else null.
  return id <= MAX_INTEGER ? id : null;
};
