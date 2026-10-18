import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_SORT_FIELDS } from "@ecommerce/api-contracts";
import { Link } from "react-router-dom";
import { getApiBaseUrl } from "../api/client.js";
import { fetchProducts } from "../api/products.js";
import { useCart } from "../cart/CartContext.js";
import { EmptyState, Page, PageHeader } from "../components/Page.js";
import { CartIcon, PlusIcon, UploadIcon } from "../components/icons.js";
import { ImportModal } from "../components/ImportModal.js";
import { ProductFormModal } from "../components/ProductFormModal.js";
import { formatMoney, formatWeight } from "../format.js";

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

type EmptyCatalogAction = "clear" | "showUnavailable" | "create";

export interface EmptyCatalogCopy {
  title: string;
  text: string;
  action: EmptyCatalogAction;
  actionLabel: string;
}

export function emptyCatalogCopy(hasFilters: boolean, inStockOnly: boolean): EmptyCatalogCopy {
  if (hasFilters) {
    return {
      title: "No matching products",
      text: "Nothing matches the current search and filters.",
      action: "clear",
      actionLabel: "Clear filters",
    };
  }
  if (inStockOnly) {
    return {
      title: "No products to show",
      text: "Every product is archived or out of stock. Reveal them to browse the full catalog.",
      action: "showUnavailable",
      actionLabel: "Show archived and out of stock",
    };
  }
  return {
    title: "No products yet",
    text: "Create a product or import a CSV to fill the catalog.",
    action: "create",
    actionLabel: "Create your first product",
  };
}

export type CatalogModal = { kind: "create" } | { kind: "import" };

export function CatalogPage() {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<CatalogModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cart = useCart();
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["products", { search, sort, order, page, includeArchived, inStockOnly }],
    queryFn: () =>
      fetchProducts(apiBaseUrl, {
        q: search === "" ? undefined : search,
        sort,
        order,
        page,
        pageSize: PAGE_SIZE,
        includeArchived,
        inStock: inStockOnly,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = query.data?.pagination.totalPages ?? 0;
  const hasFilters = search !== "" || includeArchived;
  const emptyCopy = emptyCatalogCopy(hasFilters, inStockOnly);

  function closeModal(): void {
    setModal(null);
  }

  function afterSaved(message: string): void {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["product"] });
    closeModal();
    setNotice(message);
  }

  function clearFilters(): void {
    setSearchInput("");
    setIncludeArchived(false);
  }

  function showUnavailable(): void {
    setInStockOnly(false);
    setPage(1);
  }

  return (
    <Page label="Product catalog" width="wide">
      <PageHeader
        title="Product catalog"
        description="Search by name, SKU, description, or category, then sort and filter by availability."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-label="Import CSV"
              onClick={() => {
                setNotice(null);
                setModal({ kind: "import" });
              }}
              className="btn btn-secondary"
            >
              <UploadIcon />
              <span className="btn-label">Import CSV</span>
            </button>
            <button
              type="button"
              aria-label="New product"
              onClick={() => {
                setNotice(null);
                setModal({ kind: "create" });
              }}
              className="btn btn-primary"
            >
              <PlusIcon />
              <span className="btn-label">New product</span>
            </button>
          </div>
        }
      />
      <form
        className="card mt-6 flex flex-wrap items-end gap-4 p-4"
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <div className="w-full sm:w-auto">
          <label htmlFor="catalog-search" className="block text-sm font-medium text-slate-700">
            Search
          </label>
          <input
            id="catalog-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Name, SKU, description, category"
            className="input mt-1 w-full sm:w-64"
          />
        </div>
        <div className="w-full sm:w-auto">
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
            className="input mt-1 w-full sm:w-auto"
          >
            {PRODUCT_SORT_FIELDS.map((field) => (
              <option key={field} value={field}>
                {SORT_LABELS[field] ?? field}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
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
            className="input mt-1 w-full sm:w-auto"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <label className="flex w-full items-center gap-2 text-sm text-slate-700 sm:w-auto sm:pb-1.5">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) => {
              setInStockOnly(event.target.checked);
              setPage(1);
            }}
            className="size-4 rounded border-slate-300"
          />
          In stock only
        </label>
        <label className="flex w-full items-center gap-2 text-sm text-slate-700 sm:w-auto sm:pb-1.5">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => {
              setIncludeArchived(event.target.checked);
              setPage(1);
            }}
            className="size-4 rounded border-slate-300"
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
        <div role="alert" className="alert alert-error mt-6">
          <p>Product list failed to load.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="btn btn-secondary mt-3"
          >
            Retry
          </button>
        </div>
      )}
      {query.data !== undefined && query.data.data.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={emptyCopy.title}
            action={
              <button
                type="button"
                className={emptyCopy.action === "create" ? "btn btn-primary" : "btn btn-secondary"}
                onClick={
                  emptyCopy.action === "clear"
                    ? clearFilters
                    : emptyCopy.action === "showUnavailable"
                      ? showUnavailable
                      : () => {
                          setNotice(null);
                          setModal({ kind: "create" });
                        }
                }
              >
                {emptyCopy.actionLabel}
              </button>
            }
          >
            {emptyCopy.text}
          </EmptyState>
        </div>
      )}
      {query.data !== undefined && query.data.data.length > 0 && (
        <>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.data.map((product) => {
              const unavailable = product.archivedAt !== null || product.stock <= 0;
              const quantity = quantities[product.id] ?? 1;
              return (
                <li key={product.id} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/products/${product.id}`}
                      className="font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {product.name}
                    </Link>
                    {product.archivedAt !== null && (
                      <span className="badge badge-neutral">Archived</span>
                    )}
                    {product.archivedAt === null && product.stock <= 0 && (
                      <span className="badge badge-warning">Out of stock</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {product.sku} · {product.category}
                  </p>
                  <p className="mt-2 line-clamp-3 grow text-sm text-slate-600">
                    {product.description === "" ? "No description." : product.description}
                  </p>
                  <p className="mt-3 flex items-baseline gap-2 text-sm">
                    <span className="text-base font-semibold text-slate-900">
                      {formatMoney(product.price)}
                    </span>
                    <span className="text-xs text-slate-500">
                      Stock {product.stock} · {formatWeight(product.weightKg)}
                    </span>
                  </p>
                  <div className="mt-4 flex items-center gap-2">
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
                      className="input w-20"
                    />
                    <button
                      type="button"
                      aria-label="Add to cart"
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
                      className="btn btn-primary grow"
                    >
                      <CartIcon />
                      <span className="btn-label">Add to cart</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="btn btn-secondary"
            >
              Previous
            </button>
            <span aria-live="polite" className="text-slate-600">
              Page {query.data.pagination.page} of {Math.max(totalPages, 1)} ·{" "}
              {query.data.pagination.totalItems} products
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="btn btn-secondary"
            >
              Next
            </button>
          </div>
        </>
      )}

      {notice !== null && (
        <p role="status" className="alert alert-success mt-6">
          {notice}
        </p>
      )}

      {modal?.kind === "create" && (
        <ProductFormModal
          mode="create"
          onClose={closeModal}
          onSaved={(created) => afterSaved(`Created ${created.name}.`)}
        />
      )}
      {modal?.kind === "import" && (
        <ImportModal
          onClose={closeModal}
          onImported={(created) => {
            void queryClient.invalidateQueries({ queryKey: ["products"] });
            setNotice(
              `Imported ${created} ${created === 1 ? "product" : "products"}. The catalog is up to date.`,
            );
          }}
        />
      )}
    </Page>
  );
}
