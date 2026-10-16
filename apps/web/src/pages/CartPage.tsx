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
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <div>
        <p className="font-medium">{live?.name ?? entry.product.name}</p>
        <p className="text-xs text-slate-500">
          {live?.sku ?? entry.product.sku} · {formatMoney(live?.price ?? entry.product.price)} each
        </p>
        {detail.isError && (
          <p role="alert" className="text-xs text-red-700">
            Details unavailable.
          </p>
        )}
        {unavailable && (
          <p className="text-xs font-medium text-amber-700">No longer available for purchase.</p>
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
          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <span className="text-xs text-slate-500">of {effectiveStock} in stock</span>
        <button
          type="button"
          onClick={() => cart.removeItem(entry.product.id)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export function CartPage() {
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
      <section aria-label="Order confirmation">
        <h2 className="text-xl font-semibold text-slate-900">Order confirmed</h2>
        <p role="status" className="mt-2 text-sm text-green-700">
          Payment succeeded. Order total {formatMoney(order.total)}.
        </p>
        <dl className="mt-3 grid max-w-xl gap-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-32 font-medium text-slate-600">Order id</dt>
            <dd>{order.id}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-32 font-medium text-slate-600">Reference</dt>
            <dd>{order.paymentReference}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-32 font-medium text-slate-600">Items</dt>
            <dd>{order.items.length}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">
          <Link to={`/orders/${order.id}`} className="text-blue-700 hover:underline">
            View order details
          </Link>
        </p>
      </section>
    );
  }

  if (cart.entries.length === 0) {
    return (
      <section aria-label="Shopping cart">
        <h2 className="text-xl font-semibold text-slate-900">Shopping cart</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your cart is empty.{" "}
          <Link to="/" className="text-blue-700 hover:underline">
            Browse the catalog
          </Link>
          .
        </p>
      </section>
    );
  }

  const estimate = estimateSubtotal(
    cart.entries.map((entry) => ({ price: entry.product.price, quantity: entry.quantity })),
  );

  return (
    <section aria-label="Shopping cart">
      <h2 className="text-xl font-semibold text-slate-900">Shopping cart</h2>
      <ul className="mt-3 max-w-2xl divide-y divide-slate-200 rounded border border-slate-200 bg-white text-sm">
        {cart.entries.map((entry) => (
          <CartLineRow key={entry.product.id} entry={entry} />
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-700">
        Estimated subtotal: <span className="font-semibold">{formatMoney(estimate)}</span>{" "}
        <span className="text-slate-500">
          (final total is calculated by the server at checkout)
        </span>
      </p>

      <div className="mt-4 max-w-2xl rounded border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">Checkout</h3>
        {checkoutError instanceof ApiError && checkoutError.code === "PAYMENT_DECLINED" && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            Payment was declined. No order was created and stock is unchanged.
          </p>
        )}
        {checkoutError instanceof ApiError && checkoutError.code === "INSUFFICIENT_STOCK" && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            Some items are no longer in stock. Nothing was charged and no order was created.
          </p>
        )}
        {checkoutError !== null &&
          (!(checkoutError instanceof ApiError) ||
            (checkoutError.code !== "PAYMENT_DECLINED" &&
              checkoutError.code !== "INSUFFICIENT_STOCK")) && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              Checkout failed{checkoutError instanceof ApiError ? ` (${checkoutError.code})` : ""}:{" "}
              {checkoutError.message} Retrying reuses the same idempotency key.
            </p>
          )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={checkout.isPending}
            onClick={() => checkout.mutate()}
            className="rounded bg-blue-700 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {checkout.isPending
              ? "Processing…"
              : checkoutError !== null
                ? "Retry checkout"
                : "Place order"}
          </button>
          <Link to="/" className="rounded border border-slate-300 px-4 py-1.5 text-sm">
            Continue shopping
          </Link>
        </div>
      </div>
    </section>
  );
}
