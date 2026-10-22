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

// The date formatter: day, short month name and year in British order, e.g. "21 Oct 2026".
// It uses the browser's own time zone, so an order placed late in the evening shows the
// customer's local date.
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Turns the API's date-time text (e.g. '2026-10-21T12:00:00.000Z') into "21 Oct 2026".
// new Date(text) reads the text into a Date object, which the formatter then writes out.
export function formatDate(iso) {
  return dateFormat.format(new Date(iso));
}

// Turns an order status from the API ('paid', 'delivered', ...) into a label: 'Paid'.
// status[0] is the first character; .toUpperCase() makes it a capital; .slice(1) is everything
// from the second character on.
export function formatStatus(status) {
  return status[0].toUpperCase() + status.slice(1);
}
