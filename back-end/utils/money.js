// Converting prices between the two forms the API uses:
//   text with 2 decimal places, e.g. '24.50'. This is how PostgreSQL sends
//     numeric values, and how the API sends every price.
//   whole pence, e.g. 2450. This is used for the API's own money maths, and is
//     what Stripe expects.
//
// Why not just use Number('24.50')? JavaScript numbers are "floating point":
// they can't hold most decimals exactly, so 0.1 + 0.2 gives 0.30000000000000004.
// Whole numbers ARE exact, so adding pence (2450 + 395 = 2845) never goes wrong.
// That's why toPence splits the text at the dot instead of reading it as a decimal.

// A money amount as text: one or more digits, a dot, then exactly two digits.
//   ^ and $   the start and end of the text, so nothing else may come before or after
//   (\d+)     one or more digits (the pounds). The brackets "capture" them for later
//   \.        a real dot (a plain . would mean "any character")
//   (\d{2})   exactly two digits (the pence), also captured
const MONEY_PATTERN = /^(\d+)\.(\d{2})$/;

// True if `value` is text in exactly that form, e.g. '28.45'. Numbers (28.45)
// and other forms ('28.4', '28') are false. The typeof check comes first,
// because .test() would turn a number into text and might match it.
export const isMoneyString = (value) => typeof value === 'string' && MONEY_PATTERN.test(value);

// '24.50' -> 2450. Throws a TypeError for anything that isn't a 2-decimal
// amount, so a bad value can never quietly turn into a wrong price.
export const toPence = (amount) => {
  // .exec() matches the pattern and returns the captured parts, or null if it
  // doesn't match. For '24.50' it gives ['24.50', '24', '50']: the whole match,
  // then each captured group. `typeof` guards against non-text first.
  const match = typeof amount === 'string' ? MONEY_PATTERN.exec(amount) : null;
  if (!match) {
    throw new TypeError(`Not a money amount with 2 decimal places: ${JSON.stringify(amount)}`);
  }
  // Array destructuring: skip the first element (the whole match, hence the
  // empty slot before the first comma) and name the other two.
  const [, pounds, pence] = match;
  // Number('24') is exactly 24, and Number('50') is exactly 50: whole numbers.
  return Number(pounds) * 100 + Number(pence);
};

// 2845 -> '28.45', and 5 -> '0.05'.
export const fromPence = (pence) => {
  // Math.floor rounds down to a whole number: 2845 / 100 = 28.45, so 28.
  const pounds = Math.floor(pence / 100);
  // % gives the remainder after dividing: 2845 % 100 = 45.
  // String(5).padStart(2, '0') adds zeros at the front until it's 2 long: '05'.
  const remainder = String(pence % 100).padStart(2, '0');
  // A template literal: ${...} inserts each value into the text.
  return `${pounds}.${remainder}`;
};
