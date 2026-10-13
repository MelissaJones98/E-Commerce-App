// The largest value a PostgreSQL `integer` column can hold.
export const MAX_INTEGER = 2147483647;

// Converts an id from a URL (always a string) to a number.
// Returns null unless it's a whole number from 1 to MAX_INTEGER, so "abc",
// "1.5", "0" and "-1" are rejected before reaching the database.
export const parseId = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return id <= MAX_INTEGER ? id : null;
};
