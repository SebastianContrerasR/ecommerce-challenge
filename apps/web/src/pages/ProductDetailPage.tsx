import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { archiveProduct, fetchProduct } from "../api/products.js";
import { useCart } from "../cart/CartContext.js";
import { formatMoney, formatWeight } from "../format.js";

export function ProductDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [quantity, setQuantity] = useState(1);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const cart = useCart();

  const detail = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(apiBaseUrl, id ?? ""),
    enabled: id !== undefined && id !== "",
  });

  const archive = useMutation({
    mutationFn: () => archiveProduct(apiBaseUrl, id ?? ""),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product", id] });
      setConfirmingArchive(false);
    },
  });

  if (id === undefined || id === "") {
    return <p role="alert">Missing product id.</p>;
  }

  if (detail.isPending) {
    return <p role="status">Loading product…</p>;
  }

  if (detail.isError) {
    const code = detail.error instanceof ApiError ? detail.error.code : "REQUEST_FAILED";
    return (
      <div role="alert">
        <p>{code === "PRODUCT_NOT_FOUND" ? "Product not found." : "Product failed to load."}</p>
        <p>
          <Link to="/" className="text-blue-700 hover:underline">
            Back to catalog
          </Link>
        </p>
      </div>
    );
  }

  const product = detail.data;
  const unavailable = product.archivedAt !== null || product.stock <= 0;

  return (
    <section aria-label="Product detail">
      <p>
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          ← Back to catalog
        </Link>
      </p>
      <div className="mt-2 flex items-center gap-3">
        <h2 className="text-xl font-semibold text-slate-900">{product.name}</h2>
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
      <dl className="mt-4 grid max-w-xl gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 font-medium text-slate-600">SKU</dt>
          <dd>{product.sku}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 font-medium text-slate-600">Category</dt>
          <dd>{product.category}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 font-medium text-slate-600">Price</dt>
          <dd>{formatMoney(product.price)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 font-medium text-slate-600">Stock</dt>
          <dd>{product.stock}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 font-medium text-slate-600">Weight</dt>
          <dd>{formatWeight(product.weightKg)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 font-medium text-slate-600">Description</dt>
          <dd>{product.description === "" ? "No description." : product.description}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="detail-quantity" className="text-sm font-medium text-slate-700">
          Quantity
        </label>
        <input
          id="detail-quantity"
          type="number"
          min={1}
          max={Math.max(product.stock, 1)}
          value={quantity}
          disabled={unavailable}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            setQuantity(Number.isInteger(next) ? next : 1);
          }}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
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
        {product.archivedAt === null && (
          <Link
            to={`/products/${product.id}/edit`}
            className="rounded border border-slate-300 px-3 py-1 text-sm"
          >
            Edit
          </Link>
        )}
      </div>

      <div className="mt-6 max-w-xl rounded border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">Manage product</h3>
        {product.archivedAt === null ? (
          confirmingArchive ? (
            <div>
              <p className="mt-1 text-sm">
                Archive this product? It will leave the catalog but stay in order history.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate()}
                  className="rounded bg-red-700 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  {archive.isPending ? "Archiving…" : "Confirm archive"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingArchive(false)}
                  className="rounded border border-slate-300 px-3 py-1 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingArchive(true)}
              className="mt-2 rounded border border-red-300 px-3 py-1 text-sm text-red-700"
            >
              Archive product
            </button>
          )
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            This product is archived and cannot be purchased.
          </p>
        )}
        {archive.isError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            Archive failed. The product may already be archived.
          </p>
        )}
        {archive.isSuccess && (
          <p role="status" className="mt-2 text-sm text-green-700">
            Product archived.
          </p>
        )}
      </div>
    </section>
  );
}
