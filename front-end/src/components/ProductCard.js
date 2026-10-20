// ProductCard: one product in the Products grid. The whole card is a single link to the
// product's own page, so it can be clicked anywhere (and is one Tab stop for keyboard users).
// It shows the name, the description (cut to 2 lines by CSS; the full text is on the product
// page), the price, and "Out of stock" when none are left.

// Link: a link that changes page without reloading the website (see Layout.js).
import { Link } from 'react-router';
import { formatPrice } from '../format';

// `{ product }` destructures the props: <ProductCard product={mug} /> gives product = mug.
export default function ProductCard({ product }) {
  return (
    // <article>: a self-contained piece of content (one product), which screen readers can
    // jump between.
    <article className="product-card">
      {/* `${...}` builds the URL from the product's id, e.g. '/products/1'. */}
      <Link to={`/products/${product.id}`} className="product-card-link">
        {/* <h2>: the page's <h1> is "Products"; each card's name sits one level below it. */}
        <h2 className="product-name">{product.name}</h2>
        {/* `condition && (...)` draws the paragraph only when there is a description, so a
            product with none (null) never shows the word "null". */}
        {product.description && <p className="product-description">{product.description}</p>}
        <p className="product-price">{formatPrice(product.price)}</p>
        {/* `===` checks the value AND type match: exactly the number 0. */}
        {product.stock_quantity === 0 && <p className="out-of-stock">Out of stock</p>}
      </Link>
    </article>
  );
}
