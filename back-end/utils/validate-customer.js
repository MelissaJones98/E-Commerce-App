// Validation rules for customer details, shared by registration
// (POST /auth/register in routes/auth.js) and account updates
// (PUT /account in routes/account.js), so both always apply the same rules.
//
// Each validator returns either:
//   - a string describing the first problem it finds, e.g. 'email is required'
//   - or null, meaning everything it checked is valid
// The routes send any error string back to the client in a 400 response.

// A "regular expression" (regex) describes a pattern of text. `.test(text)`
// returns true if the text matches the pattern.
//
// EMAIL_PATTERN is a deliberately simple check for "something@something.something":
//   ^         start of the text
//   [^\s@]+   one or more characters that aren't spaces (\s) or @
//   @         a literal @
//   [^\s@]+   the domain name, e.g. "example"
//   \.        a literal dot
//   [^\s@]+   the ending, e.g. "com"
//   $         end of the text
// Fully validating email addresses is notoriously complex; the only real
// test is whether the address receives mail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PHONE_PATTERN allows only digits, spaces, +, -, and brackets,
// e.g. "+44 (0)20 7946-0000".
//   [0-9+()\-\s]   one of: a digit, +, (, ), - (escaped as \-), or a space (\s)
//   +              one or more of those characters
//   ^ ... $        the WHOLE text must match, not just part of it
const PHONE_PATTERN = /^[0-9+()\-\s]+$/;

// True if `value` is a string with at least one non-space character.
// `typeof value === 'string'` rules out numbers, null, undefined and so on.
// `.trim()` removes spaces from both ends, so '   ' becomes '' and fails.
// `export` makes this usable from other files (routes/auth.js uses it too).
export const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// Checks first_name, last_name and email.
// The `({ first_name, last_name, email })` parameter is "destructuring": the
// function is passed an object (e.g. the request body) and pulls out just
// these three properties. Any other properties are ignored.
// Length limits match the column sizes in schema.sql, so a value that passes
// here always fits in the database.
export const validateNameAndEmail = ({ first_name, last_name, email }) => {
  // Each `if` checks one rule. `return` stops the function immediately, so
  // only the first problem found is reported.
  if (!isNonEmptyString(first_name)) return 'first_name is required';
  if (first_name.length > 100) return 'first_name must be 100 characters or fewer';

  if (!isNonEmptyString(last_name)) return 'last_name is required';
  if (last_name.length > 100) return 'last_name must be 100 characters or fewer';

  if (!isNonEmptyString(email)) return 'email is required';
  // Check the trimmed email, because surrounding spaces are removed before
  // it's saved (see utils/normalize-email.js).
  if (email.trim().length > 255) return 'email must be 255 characters or fewer';
  if (!EMAIL_PATTERN.test(email.trim())) return 'email must be a valid email address';

  // Every rule passed.
  return null;
};

// Checks an optional phone number.
export const validatePhone = (phone) => {
  // `== null` (two equals signs, not three) is true for BOTH null and
  // undefined. So leaving phone out, or sending null, counts as valid:
  // phone is optional.
  if (phone == null) return null;

  // Phone numbers must be strings, because they can contain +, spaces and
  // brackets, and can start with 0 (which a JSON number would drop).
  if (typeof phone !== 'string') return 'phone must be a string';
  // customers.phone is varchar(30) in schema.sql.
  if (phone.length > 30) return 'phone must be 30 characters or fewer';
  if (!PHONE_PATTERN.test(phone)) {
    return 'phone can only contain digits, spaces, +, - and brackets';
  }

  return null;
};
