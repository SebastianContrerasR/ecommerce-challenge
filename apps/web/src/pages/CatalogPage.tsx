import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PRODUCT_SORT_FIELDS } from "@ecommerce/api-contracts";
import { getApiBaseUrl } from "../api/client.js";
import { fetchProducts } from "../api/products.js";
import { useCart } from "../cart/CartContext.js";
import { formatMoney, formatWeight } from "../format.js";
import { Link } from "react-router-dom";

const PAGE_SIZE = 12;

const SORT_LABELS: Record<string, string> = {
  name: "Name",
  sku: "SKU",
  category: "Category",
  price: "Price",
  stock: "Stock",
  weightKg: "Weight",
  createdAt: "Newest",
  updatedAt: "Recently updated",
};

export function CatalogPage() {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const cart = useCart();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setCategory(categoryInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, categoryInput]);

  const query = useQuery({
    queryKey: ["products", { search, category, sort, order, page, includeArchived }],
    queryFn: () =>
      fetchProducts(apiBaseUrl, {
        q: search === "" ? undefined : search,
        category: category === "" ? undefined : category,
        sort,
        order,
        page,
        pageSize: PAGE_SIZE,
        includeArchived,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = query.data?.pagination.totalPages ?? 0;

  return (
    <section aria-label="Product catalog">
      <h2 className="text-xl font-semibold text-slate-900">Product catalog</h2>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <div>
          <label htmlFor="catalog-search" className="block text-sm font-medium text-slate-700">
            Search
          </label>
          <input
            id="catalog-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Name, SKU, description, category"
            className="mt-1 w-64 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="catalog-category" className="block text-sm font-medium text-slate-700">
            Category
          </label>
          <input
            id="catalog-category"
            type="text"
            value={categoryInput}
            onChange={(event) => setCategoryInput(event.target.value)}
            placeholder="Exact category"
            className="mt-1 w-40 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="catalog-sort" className="block text-sm font-medium text-slate-700">
            Sort by
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {PRODUCT_SORT_FIELDS.map((field) => (
              <option key={field} value={field}>
                {SORT_LABELS[field] ?? field}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="catalog-order" className="block text-sm font-medium text-slate-700">
            Order
          </label>
          <select
            id="catalog-order"
            value={order}
            onChange={(event) => {
              setOrder(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => {
              setIncludeArchived(event.target.checked);
              setPage(1);
            }}
          />
          Include archived
        </label>
      </form>

      {query.isPending && (
        <p role="status" className="mt-6 text-sm text-slate-600">
          Loading products…
        </p>
      )}
      {query.isError && (
        <div role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-3 text-sm">
          <p>Product list failed to load.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 rounded bg-red-700 px-3 py-1 text-white"
          >
            Retry
          </button>
        </div>
      )}
      {query.data !== undefined && query.data.data.length === 0 && (
        <p className="mt-6 text-sm text-slate-600">
          No products found. Adjust the search or filters.
        </p>
      )}
      {query.data !== undefined && query.data.data.length > 0 && (
        <>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.data.map((product) => {
              const unavailable = product.archivedAt !== null || product.stock <= 0;
              const quantity = quantities[product.id] ?? 1;
              return (
                <li
                  key={product.id}
                  className="rounded border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/products/${product.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {product.name}
                    </Link>
                    {product.archivedAt !== null && (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        Archived
                      </span>
                    )}
                    {product.archivedAt === null && product.stock <= 0 && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Out of stock
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {product.sku} · {product.category}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {product.description === "" ? "No description." : product.description}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">{formatMoney(product.price)}</span>
                    <span className="text-slate-500">
                      {" "}
                      · Stock {product.stock} · {formatWeight(product.weightKg)}
                    </span>
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <label htmlFor={`qty-${product.id}`} className="sr-only">
                      Quantity for {product.name}
                    </label>
                    <input
                      id={`qty-${product.id}`}
                      type="number"
                      min={1}
                      max={Math.max(product.stock, 1)}
                      value={quantity}
                      disabled={unavailable}
                      onChange={(event) => {
                        const next = Number.parseInt(event.target.value, 10);
                        setQuantities((current) => ({
                          ...current,
                          [product.id]: Number.isInteger(next) ? next : 1,
                        }));
                      }}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={unavailable}
                      onClick={() =>
                        cart.addItem(
                          {
                            id: product.id,
                            name: product.name,
                            sku: product.sku,
                            price: product.price,
                            stock: product.stock,
                            archivedAt: product.archivedAt,
                          },
                          quantity,
                        )
                      }
                      className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:bg-slate-300"
                    >
                      Add to cart
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <span aria-live="polite">
              Page {query.data.pagination.page} of {Math.max(totalPages, 1)} ·{" "}
              {query.data.pagination.totalItems} products
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
