// Turns a delivery address from the API into the lines to print on an order, one per line.
//
// The API sends an address as an object:
//   { id, line_1, line_2, city, region, postal_code, country_code }
// line_2 and region are optional, so they may be null (or an empty string '').
//
// addressLines(address) returns an ARRAY of the parts to show, in this order:
//   line_1, line_2, city, region, postal_code, country_code
// leaving out any part that is null or empty. For example:
//   { line_1: '10 Downing Street', line_2: null, city: 'London', region: null,
//     postal_code: 'SW1A 2AA', country_code: 'GB' }
//   → ['10 Downing Street', 'London', 'SW1A 2AA', 'GB']
// (`id` is never shown.)

export function addressLines(address) {
  // Every part of the address, in the order they're printed. `address.line_1` reads the line_1
  // property of the address object; the square brackets make an array of all six values
  // (some of which may be null or '').
  const addressFormat = [
    address.line_1,
    address.line_2,
    address.city,
    address.region,
    address.postal_code,
    address.country_code,
  ];
  // .filter() makes a new array, keeping only the parts for which the function returns true.
  // (part) => Boolean(part) is an arrow function: for each part, Boolean(part) is false for
  // null and '' (nothing there) and true for real text, so the empty parts are left out.
  const addressInput = addressFormat.filter((part) => Boolean(part));
  return addressInput;
}
