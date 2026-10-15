// Validation for the two parts of a checkout request: the shipping address
// and the payment details. Used by routes/checkout.js.
//
// Each validator returns either a string describing the first problem it
// finds (which the route sends back in a 400 response), or null if valid.

// isNonEmptyString(value): true for a string with at least one non-space character.
import { isNonEmptyString } from './validate-customer.js';

// True if `value` is null/undefined (left out) or a string. Used for
// optional text fields. `== null` (two equals signs) matches both null and undefined.
const isOptionalString = (value) => value == null || typeof value === 'string';

// A 2-letter country code, e.g. GB. [A-Za-z]{2} means exactly two letters,
// upper or lower case (the route stores it in capitals).
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

// ---------------------------------------------------------------------------
// Shipping address
// ---------------------------------------------------------------------------

// Checks the shipping_address object. Length limits match the addresses
// columns in schema.sql, so anything that passes here fits in the database.
export const validateShippingAddress = (address) => {
  // `typeof null` is 'object' in JavaScript, so null needs its own check.
  if (address == null || typeof address !== 'object') return 'shipping_address is required';

  // Destructuring: pull the fields out of the object into variables.
  const { line_1, line_2, city, region, postal_code, country_code } = address;

  if (!isNonEmptyString(line_1)) return 'shipping_address.line_1 is required';
  if (line_1.length > 255) return 'shipping_address.line_1 must be 255 characters or fewer';

  // line_2 and region are optional, but must be text if given.
  if (!isOptionalString(line_2)) return 'shipping_address.line_2 must be a string';
  // `?.` (optional chaining) gives undefined instead of crashing if line_2 is
  // null, and `undefined > 255` is false, so a missing line_2 passes.
  if (line_2?.length > 255) return 'shipping_address.line_2 must be 255 characters or fewer';

  if (!isNonEmptyString(city)) return 'shipping_address.city is required';
  if (city.length > 100) return 'shipping_address.city must be 100 characters or fewer';

  if (!isOptionalString(region)) return 'shipping_address.region must be a string';
  if (region?.length > 100) return 'shipping_address.region must be 100 characters or fewer';

  if (!isNonEmptyString(postal_code)) return 'shipping_address.postal_code is required';
  if (postal_code.length > 20) return 'shipping_address.postal_code must be 20 characters or fewer';

  // typeof check first: .test() would turn a non-string into text and might match.
  if (typeof country_code !== 'string' || !COUNTRY_CODE_PATTERN.test(country_code)) {
    return 'shipping_address.country_code must be a 2-letter country code, e.g. GB';
  }

  return null;
};

// ---------------------------------------------------------------------------
// Payment details
// ---------------------------------------------------------------------------

// Removes spaces and hyphens from a card number, so "4242 4242 4242 4242"
// and "4242-4242-4242-4242" both become "4242424242424242".
// /[\s-]/g matches any space (\s) or hyphen; `g` ("global") means every one.
export const cardDigits = (cardNumber) => cardNumber.replace(/[\s-]/g, '');

// The Luhn check: a checksum every real card number passes. It catches most
// typos, such as a single wrong digit or two neighbouring digits swapped.
// How it works, starting from the RIGHTMOST digit:
//   1. Double every second digit (the 2nd from the right, the 4th, and so on).
//   2. If doubling gives more than 9, subtract 9 (e.g. 7 x 2 = 14, 14 - 9 = 5).
//   3. Add up all the digits. A valid number's total is a multiple of 10.
const passesLuhnCheck = (digits) => {
  let sum = 0;
  // Loop from the last character to the first. `i` is the position from the
  // start; `fromRight` counts 0, 1, 2... from the end.
  for (let i = digits.length - 1, fromRight = 0; i >= 0; i--, fromRight++) {
    let digit = Number(digits[i]);
    // `%` is the remainder after division: fromRight % 2 === 1 is true for
    // every second digit from the right.
    if (fromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

// True if a card with this expiry month and year has already expired.
// Cards stay valid until the END of their expiry month, so a card expiring
// this month is still fine.
const hasExpired = (month, year) => {
  const now = new Date();
  // getMonth() counts from 0 (January = 0), so add 1 to match card months.
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  // `||` means "or": expired if the year is past, OR it's this year and the month is past.
  return year < thisYear || (year === thisYear && month < thisMonth);
};

// Checks the payment object. These are the checks a real checkout would make
// before contacting the payment processor, so obviously wrong details are
// caught straight away with a helpful message.
export const validatePayment = (payment) => {
  if (payment == null || typeof payment !== 'object') return 'payment is required';

  const { cardholder_name, card_number, expiry_month, expiry_year, cvc } = payment;

  if (!isNonEmptyString(cardholder_name)) return 'payment.cardholder_name is required';

  // Card numbers must be strings: as a JSON number, a long card number can
  // lose digits, because JavaScript numbers can't hold that many digits exactly.
  if (typeof card_number !== 'string') return 'payment.card_number must be a string';
  // /^[\d\s-]+$/: the whole string must be digits (\d), spaces (\s) or hyphens.
  if (!/^[\d\s-]+$/.test(card_number)) {
    return 'payment.card_number can only contain digits, spaces and hyphens';
  }
  const digits = cardDigits(card_number);
  // Real card numbers are between 12 and 19 digits long.
  if (digits.length < 12 || digits.length > 19) {
    return 'payment.card_number must be between 12 and 19 digits';
  }
  if (!passesLuhnCheck(digits)) return 'payment.card_number is not a valid card number';

  // Number.isInteger() rejects strings ('12') and decimals.
  if (!Number.isInteger(expiry_month) || expiry_month < 1 || expiry_month > 12) {
    return 'payment.expiry_month must be a whole number from 1 to 12';
  }
  // A 4-digit year, so a 2-digit year like 99 can't be mistaken for 0099.
  if (!Number.isInteger(expiry_year) || expiry_year < 1000 || expiry_year > 9999) {
    return 'payment.expiry_year must be a 4-digit year, e.g. 2030';
  }
  if (hasExpired(expiry_month, expiry_year)) return 'payment card has expired';

  // CVC: the 3 or 4 digit security code. Kept as a string, because codes can
  // start with 0 (a JSON number would drop it). \d{3,4} means 3 or 4 digits.
  if (typeof cvc !== 'string' || !/^\d{3,4}$/.test(cvc)) {
    return 'payment.cvc must be 3 or 4 digits';
  }

  return null;
};
