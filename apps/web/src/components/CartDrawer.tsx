import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { fetchProduct } from "../api/products.js";
import { createOrder } from "../api/orders.js";
import type { Order } from "../api/orders.js";
import { useCart } from "../cart/CartContext.js";
import type { CartEntry } from "../cart/cart.js";
import { estimateSubtotal, formatMoney } from "../format.js";
import { CartIcon } from "./icons.js";
import { Modal } from "./Modal.js";
import { EmptyState } from "./Page.js";

const LAST_ORDER_KEY = "ecommerce-last-order";

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function CartLineRow({ entry }: { entry: CartEntry }) {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const cart = useCart();
  const detail = useQuery({
    queryKey: ["product", entry.product.id],
    queryFn: () => fetchProduct(apiBaseUrl, entry.product.id),
  });

  const live = detail.data;
  const unavailable = live !== undefined && (live.archivedAt !== null || live.stock <= 0);
  const effectiveStock = live?.stock ?? entry.product.stock;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">
          <Link
            to={`/products/${entry.product.id}`}
            className="hover:text-blue-700 hover:underline"
          >
            {live?.name ?? entry.product.name}
          </Link>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {live?.sku ?? entry.product.sku} · {formatMoney(live?.price ?? entry.product.price)} each
        </p>
        {detail.isError && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            Details unavailable.
          </p>
        )}
        {unavailable && (
          <p className="mt-1 text-xs font-medium text-amber-700">
            No longer available for purchase.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={`cart-qty-${entry.product.id}`} className="sr-only">
          Quantity
        </label>
        <input
          id={`cart-qty-${entry.product.id}`}
          type="number"
          min={1}
          max={Math.max(effectiveStock, 1)}
          value={entry.quantity}
          disabled={unavailable}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            cart.setQuantity(entry.product.id, Number.isInteger(next) ? next : 1);
          }}
          className="input w-16"
        />
        <span className="w-24 text-xs text-slate-500">of {effectiveStock} in stock</span>
        <button
          type="button"
          onClick={() => cart.removeItem(entry.product.id)}
          className="btn btn-ghost"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

interface CartDrawerProps {
  onClose: () => void;
}

export function CartDrawer({ onClose }: CartDrawerProps) {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const queryClient = useQueryClient();
  const cart = useCart();
  const [idempotencyKey, setIdempotencyKey] = useState<string>(newIdempotencyKey);
  const [order, setOrder] = useState<Order | null>(null);
  const [checkoutError, setCheckoutError] = useState<ApiError | Error | null>(null);
  const [attemptedItems, setAttemptedItems] = useState<string>("");

  const fingerprint = JSON.stringify(
    cart.entries.map((entry) => ({ id: entry.product.id, quantity: entry.quantity })),
  );

  useEffect(() => {
    if (checkoutError !== null && attemptedItems !== "" && attemptedItems !== fingerprint) {
      setIdempotencyKey(newIdempotencyKey());
      setCheckoutError(null);
    }
  }, [fingerprint, attemptedItems, checkoutError]);

  const checkout = useMutation({
    mutationFn: async () => {
      const items = cart.entries.map((entry) => ({
        productId: entry.product.id,
        quantity: entry.quantity,
      }));
      setAttemptedItems(fingerprint);
      return createOrder(apiBaseUrl, items, idempotencyKey);
    },
    onSuccess: (created) => {
      setOrder(created);
      setCheckoutError(null);
      cart.clear();
      try {
        localStorage.setItem(LAST_ORDER_KEY, created.id);
      } catch {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product"] });
    },
    onError: (error) => {
      setCheckoutError(error instanceof Error ? error : new Error("Checkout failed."));
    },
  });

  if (order !== null) {
    return (
      <Modal
        title="Order confirmed"
        description="Payment succeeded and stock has been updated."
        onClose={onClose}
        placement="right"
        width="md"
        closeLabel="Close cart"
      >
        <p role="status" className="alert alert-success">
          Payment succeeded. Order total {formatMoney(order.total)}.
        </p>
        <dl className="definition-list mt-4">
          <dt className="font-medium text-slate-600">Order id</dt>
          <dd className="break-all">{order.id}</dd>
          <dt className="font-medium text-slate-600">Reference</dt>
          <dd>{order.paymentReference}</dd>
          <dt className="font-medium text-slate-600">Items</dt>
          <dd>{order.items.length}</dd>
        </dl>
        <Link to={`/orders/${order.id}`} onClick={onClose} className="btn btn-primary mt-6">
          View order details
        </Link>
      </Modal>
    );
  }

  if (cart.entries.length === 0) {
    return (
      <Modal
        title="Shopping cart"
        onClose={onClose}
        placement="right"
        width="md"
        closeLabel="Close cart"
      >
        <EmptyState
          title="Your cart is empty."
          action={
            <Link
              to="/"
              onClick={onClose}
              aria-label="Browse the catalog"
              className="btn btn-primary"
            >
              <CartIcon />
              <span className="btn-label">Browse the catalog</span>
            </Link>
          }
        >
          Add products from the catalog to place an order.
        </EmptyState>
      </Modal>
    );
  }

  const estimate = estimateSubtotal(
    cart.entries.map((entry) => ({ price: entry.product.price, quantity: entry.quantity })),
  );

  return (
    <Modal
      title="Shopping cart"
      description="Stock is revalidated at checkout, and the final total is calculated by the server."
      onClose={onClose}
      placement="right"
      width="md"
      closeLabel="Close cart"
      footer={
        <>
          <div className="mr-auto">
            <p className="text-xs text-slate-500">Estimated total</p>
            <p className="text-lg font-semibold text-slate-900">{formatMoney(estimate)}</p>
          </div>
          <button
            type="button"
            disabled={checkout.isPending}
            onClick={() => checkout.mutate()}
            className="btn btn-primary"
          >
            {checkout.isPending
              ? "Processing…"
              : checkoutError !== null
                ? "Retry checkout"
                : "Place order"}
          </button>
        </>
      }
    >
      <ul className="-mx-5 -mt-4 divide-y divide-slate-200 text-sm">
        {cart.entries.map((entry) => (
          <CartLineRow key={entry.product.id} entry={entry} />
        ))}
      </ul>

      {checkoutError instanceof ApiError && checkoutError.code === "PAYMENT_DECLINED" && (
        <p role="alert" className="alert alert-error mt-4">
          Payment was declined. No order was created and stock is unchanged.
        </p>
      )}
      {checkoutError instanceof ApiError && checkoutError.code === "INSUFFICIENT_STOCK" && (
        <p role="alert" className="alert alert-error mt-4">
          Some items are no longer in stock. Nothing was charged and no order was created.
        </p>
      )}
      {checkoutError !== null &&
        (!(checkoutError instanceof ApiError) ||
          (checkoutError.code !== "PAYMENT_DECLINED" &&
            checkoutError.code !== "INSUFFICIENT_STOCK")) && (
          <p role="alert" className="alert alert-error mt-4">
            Checkout failed{checkoutError instanceof ApiError ? ` (${checkoutError.code})` : ""}:{" "}
            {checkoutError.message} Retrying reuses the same idempotency key.
          </p>
        )}
    </Modal>
  );
}
