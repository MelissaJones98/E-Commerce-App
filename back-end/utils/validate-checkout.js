// Validation for the parts of a checkout request: the shipping address, the
// Stripe PaymentMethod id, and the total the customer was shown.
// Used by routes/checkout.js.
//
// Each validator returns either a string describing the first problem it
// finds (which the route sends back in a 400 response), or null if valid.

// isNonEmptyString(value): true for a string with at least one non-space character.
import { isNonEmptyString } from './validate-customer.js';
// isMoneyString(value): true for text with exactly 2 decimal places, e.g. '28.45'.
import { isMoneyString } from './money.js';

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
// Card details never reach this API: the browser hands them straight to
// Stripe, which checks the card itself (number, expiry, security code) and
// gives the browser a PaymentMethod id instead. So there's nothing about the
// card to check here, only that the id looks like one.

// Checks payment_method_id: Stripe's id for the customer's card, which always
// starts 'pm_' (e.g. 'pm_1Q0PsI...'). Whether Stripe actually knows the id is
// only found out when the payment is attempted (services/payment-processor.js).
// .startsWith() is true if the text begins with the given characters.
export const validatePaymentMethodId = (value) =>
  typeof value === 'string' && value.startsWith('pm_') && value.length > 3
    ? null
    : 'payment_method_id must be a Stripe PaymentMethod id (pm_...)';

// Checks expected_total: the total the checkout page showed the customer on
// its Pay button, e.g. '28.45'. The route refuses to charge if the cart's real
// total no longer matches it. It must be text with exactly 2 decimal places,
// like every price the API sends (a JSON number could lose exactness).
export const validateExpectedTotal = (value) =>
  isMoneyString(value) ? null : 'expected_total must be an amount with 2 decimal places, e.g. 28.45';
