// Formatting helpers shared by the pages.

// Intl.NumberFormat is the browser's built-in number formatter. 'en-GB' gives British
// formatting (a comma for thousands, a dot for pence), and `style: 'currency'` with
// `currency: 'GBP'` adds the £ sign and always shows 2 decimal places.
// It's created once, here, rather than every time a price is shown.
const poundsFormat = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

// Turns the API's price string into what the customer sees: '8.50' → '£8.50'.
// Number('8.50') converts the text to a number. That's safe here because the number is only
// displayed; no sums are done with it (the API does all the money arithmetic exactly).
export function formatPrice(price) {
  return poundsFormat.format(Number(price));
}
