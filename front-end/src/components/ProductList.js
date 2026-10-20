// ProductList: the grid of product cards. It only draws what it's given; ProductsPage does the
// fetching. A list (<ul>) because it IS a list of products: screen readers announce
// "list, 3 items", which helps people know how many there are.

import ProductCard from './ProductCard';

export default function ProductList({ products }) {
  return (
    <ul className="product-grid">
      {/* .map() turns each product into an <li> holding its card. React needs a unique `key`
          on each item in a list, to track them between updates; the product's id is unique. */}
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
