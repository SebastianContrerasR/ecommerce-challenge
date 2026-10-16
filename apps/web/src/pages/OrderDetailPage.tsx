import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { fetchOrder } from "../api/orders.js";
import { formatMoney } from "../format.js";

export function OrderDetailPage() {
  const { id } = useParams();
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(apiBaseUrl, id ?? ""),
    enabled: id !== undefined && id !== "",
  });

  if (id === undefined || id === "") {
    return <p role="alert">Missing order id.</p>;
  }

  if (order.isPending) {
    return <p role="status">Loading order…</p>;
  }

  if (order.isError) {
    const code = order.error instanceof ApiError ? order.error.code : "REQUEST_FAILED";
    return (
      <div role="alert">
        <p>{code === "ORDER_NOT_FOUND" ? "Order not found." : "Order failed to load."}</p>
        <p>
          <Link to="/" className="text-blue-700 hover:underline">
            Back to catalog
          </Link>
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Order detail">
      <h2 className="text-xl font-semibold text-slate-900">Order {order.data.id}</h2>
      <dl className="mt-3 grid max-w-xl gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">Status</dt>
          <dd>{order.data.status}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">Payment</dt>
          <dd>
            {order.data.paymentStatus} · {order.data.paymentReference}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">Placed</dt>
          <dd>{order.data.createdAt}</dd>
        </div>
      </dl>
      <h3 className="mt-4 text-base font-semibold text-slate-900">Items</h3>
      <ul className="mt-2 max-w-2xl divide-y divide-slate-200 rounded border border-slate-200 bg-white text-sm">
        {order.data.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 px-3 py-2">
            <span>
              {item.productName} ({item.productSku})
            </span>
            <span className="text-slate-600">
              {item.quantity} × {formatMoney(item.unitPrice)} = {formatMoney(item.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        Total charged: <span className="font-semibold">{formatMoney(order.data.total)}</span>
      </p>
      <p className="mt-3 text-sm">
        <Link to="/" className="text-blue-700 hover:underline">
          Back to catalog
        </Link>
      </p>
    </section>
  );
}
