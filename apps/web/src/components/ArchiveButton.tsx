import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { archiveProduct } from "../api/products.js";
import type { Product } from "../api/products.js";
import { ArchiveIcon } from "./icons.js";
import { Modal } from "./Modal.js";

interface ArchiveButtonProps {
  product: Pick<Product, "id" | "name" | "archivedAt">;
  onArchived: (product: Product) => void;
  label?: string | undefined;
  variant?: "ghost" | "outline" | undefined;
}

export function ArchiveButton({
  product,
  onArchived,
  label = "Archive",
  variant = "ghost",
}: ArchiveButtonProps) {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [confirming, setConfirming] = useState(false);

  const archive = useMutation({
    mutationFn: () => archiveProduct(apiBaseUrl, product.id),
    onSuccess: (archived) => {
      setConfirming(false);
      onArchived(archived);
    },
  });

  if (product.archivedAt !== null) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          archive.reset();
          setConfirming(true);
        }}
        className={
          variant === "outline"
            ? "btn btn-secondary border-red-300 text-red-700 hover:bg-red-50"
            : "btn btn-ghost text-red-700 hover:bg-red-50"
        }
      >
        <ArchiveIcon />
        <span className="btn-label">{label}</span>
      </button>

      {confirming && (
        <Modal
          title={`Archive ${product.name}?`}
          description="Archiving hides the product from the catalog and blocks new orders. It stays in order history, and archived products cannot be edited."
          onClose={() => setConfirming(false)}
          width="sm"
          closeLabel="Close archive confirmation"
          bodyClassName={archive.isError ? undefined : "hidden"}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archive.isPending}
                onClick={() => archive.mutate()}
                className="btn btn-danger"
              >
                {archive.isPending ? "Archiving…" : "Confirm archive"}
              </button>
            </>
          }
        >
          {archive.isError && (
            <p role="alert" className="alert alert-error">
              {archiveErrorMessage(archive.error)}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

export function archiveErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "PRODUCT_ARCHIVED") {
    return "This product is already archived.";
  }
  return "Archive failed. The product may already be archived.";
}
