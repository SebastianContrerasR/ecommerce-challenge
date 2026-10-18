import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { fetchProduct } from "../api/products.js";
import { ArchiveButton } from "../components/ArchiveButton.js";
import { PencilIcon } from "../components/icons.js";
import { Page, PageHeader } from "../components/Page.js";
import { ProductFormModal } from "../components/ProductFormModal.js";
import { formatMoney, formatWeight } from "../format.js";
import { isUuid } from "../ids.js";

export function ProductDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(apiBaseUrl, id ?? ""),
    enabled: id !== undefined && id !== "",
  });

  if (id === undefined || id === "") {
    return (
      <Page label="Product detail" width="wide">
        <p role="alert">Missing product id.</p>
      </Page>
    );
  }

  if (!isUuid(id)) {
    return <Navigate to="/" replace />;
  }

  if (detail.isPending) {
    return (
      <Page label="Product detail" width="wide">
        <p role="status" className="text-sm text-slate-600">
          Loading product…
        </p>
      </Page>
    );
  }

  if (detail.isError) {
    const code = detail.error instanceof ApiError ? detail.error.code : "REQUEST_FAILED";
    return (
      <Page label="Product detail" width="wide">
        <div role="alert">
          <p>{code === "PRODUCT_NOT_FOUND" ? "Product not found." : "Product failed to load."}</p>
          <Link to="/" className="btn btn-secondary mt-4">
            Back to catalog
          </Link>
        </div>
      </Page>
    );
  }

  const product = detail.data;
  const archived = product.archivedAt !== null;

  return (
    <Page label="Product detail" width="wide">
      <Link to="/" className="text-sm text-blue-700 hover:underline">
        ← Back to catalog
      </Link>
      <div className="mt-3">
        <PageHeader
          title={product.name}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {archived && <span className="badge badge-neutral">Archived</span>}
              {product.archivedAt === null && product.stock <= 0 && (
                <span className="badge badge-warning">Out of stock</span>
              )}
              {archived ? (
                <Link to="/" className="btn btn-secondary">
                  Browse catalog
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label="Edit"
                    onClick={() => setEditing(true)}
                    className="btn btn-secondary"
                  >
                    <PencilIcon />
                    <span className="btn-label">Edit</span>
                  </button>
                  <ArchiveButton
                    product={product}
                    variant="outline"
                    onArchived={(archivedProduct) => {
                      void queryClient.invalidateQueries({
                        queryKey: ["product", archivedProduct.id],
                      });
                      void queryClient.invalidateQueries({ queryKey: ["products"] });
                      setNotice("Product archived.");
                    }}
                  />
                </>
              )}
            </div>
          }
        />
      </div>

      {notice !== null && (
        <p role="status" className="alert alert-success mt-6">
          {notice}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <dl className="definition-list">
            <dt className="font-medium text-slate-600">SKU</dt>
            <dd>{product.sku}</dd>
            <dt className="font-medium text-slate-600">Category</dt>
            <dd>{product.category}</dd>
            <dt className="font-medium text-slate-600">Price</dt>
            <dd className="font-semibold text-slate-900">{formatMoney(product.price)}</dd>
            <dt className="font-medium text-slate-600">Stock</dt>
            <dd>{product.stock}</dd>
            <dt className="font-medium text-slate-600">Weight</dt>
            <dd>{formatWeight(product.weightKg)}</dd>
          </dl>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900">Description</h3>
          <p className="mt-2 text-sm text-slate-700">
            {product.description === "" ? "No description." : product.description}
          </p>
          {archived && (
            <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
              This product is archived: it stays in order history but cannot be purchased or edited.
            </p>
          )}
        </div>
      </div>

      {editing && (
        <ProductFormModal
          mode="edit"
          productId={product.id}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            void queryClient.invalidateQueries({ queryKey: ["product", updated.id] });
            void queryClient.invalidateQueries({ queryKey: ["products"] });
            setEditing(false);
            setNotice(`Updated ${updated.name}.`);
          }}
        />
      )}
    </Page>
  );
}
