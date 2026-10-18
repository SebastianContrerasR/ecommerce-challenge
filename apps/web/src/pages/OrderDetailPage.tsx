import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { fetchOrder } from "../api/orders.js";
import { Page, PageHeader } from "../components/Page.js";
import { formatAbsoluteTime, formatMoney, formatRelativeTime } from "../format.js";
import { isUuid } from "../ids.js";

const ITEMS_PAGE_SIZE = 10;

type PaymentTone = "success" | "warning" | "neutral";

export function paymentTone(value: string): PaymentTone {
  if (value === "PAID" || value === "SUCCEEDED") {
    return "success";
  }
  if (value === "PENDING" || value === "DECLINED") {
    return "warning";
  }
  return "neutral";
}

const TONE_CLASS: Record<PaymentTone, string> = {
  success: "badge badge-success",
  warning: "badge badge-warning",
  neutral: "badge badge-neutral",
};

export function OrderDetailPage() {
  const { id } = useParams();
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [visibleCount, setVisibleCount] = useState(ITEMS_PAGE_SIZE);

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(apiBaseUrl, id ?? ""),
    enabled: id !== undefined && id !== "",
  });

  useEffect(() => {
    setVisibleCount(ITEMS_PAGE_SIZE);
  }, [id]);

  if (id === undefined || id === "") {
    return (
      <Page label="Order detail" width="wide">
        <p role="alert">Missing order id.</p>
      </Page>
    );
  }

  if (!isUuid(id)) {
    return <Navigate to="/" replace />;
  }

  if (order.isPending) {
    return (
      <Page label="Order detail" width="wide">
        <p role="status" className="text-sm text-slate-600">
          Loading order…
        </p>
      </Page>
    );
  }

  if (order.isError) {
    const code = order.error instanceof ApiError ? order.error.code : "REQUEST_FAILED";
    return (
      <Page label="Order detail" width="wide">
        <div role="alert">
          <p>{code === "ORDER_NOT_FOUND" ? "Order not found." : "Order failed to load."}</p>
          <Link to="/" className="mt-2 inline-block text-sm text-blue-700 hover:underline">
            ← Back to catalog
          </Link>
        </div>
      </Page>
    );
  }

  const placedAbsolute = formatAbsoluteTime(order.data.createdAt);
  const allItems = order.data.items;
  const visibleItems = allItems.slice(0, visibleCount);
  const hiddenItems = allItems.length - visibleItems.length;

  return (
    <Page label="Order detail" width="wide">
      <Link to="/" className="text-sm text-blue-700 hover:underline">
        ← Back to catalog
      </Link>
      <div className="mt-3">
        <PageHeader title={`Order ${order.data.id}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
          <dl className="definition-list mt-3">
            <dt className="font-medium text-slate-600">Order id</dt>
            <dd className="break-all">{order.data.id}</dd>
            <dt className="font-medium text-slate-600">Status</dt>
            <dd>
              <span className={TONE_CLASS[paymentTone(order.data.status)]}>
                {order.data.status}
              </span>
            </dd>
            <dt className="font-medium text-slate-600">Payment status</dt>
            <dd>
              <span className={TONE_CLASS[paymentTone(order.data.paymentStatus)]}>
                {order.data.paymentStatus}
              </span>
            </dd>
            <dt className="font-medium text-slate-600">Payment id</dt>
            <dd className="break-all">{order.data.paymentReference}</dd>
            <dt className="font-medium text-slate-600">Placed</dt>
            <dd>
              <span className="group relative inline-flex items-center">
                <time
                  dateTime={order.data.createdAt}
                  aria-describedby="order-placed-absolute"
                  tabIndex={0}
                  className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 hover:decoration-solid"
                >
                  {formatRelativeTime(order.data.createdAt)}
                </time>
                <span id="order-placed-absolute" role="tooltip" className="tooltip">
                  {placedAbsolute}
                </span>
              </span>
            </dd>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="text-sm font-medium text-slate-600">Total charged</span>
            <span className="text-sm text-slate-900">{formatMoney(order.data.total)}</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Items</h3>
            {hiddenItems > 0 && (
              <p className="text-xs text-slate-500">
                Showing {visibleItems.length} of {allItems.length}
              </p>
            )}
          </div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="min-w-0">
                  {item.productName}
                  <span className="ml-2 text-xs text-slate-500">{item.productSku}</span>
                </span>
                <span className="shrink-0 text-slate-600">
                  {item.quantity} × {formatMoney(item.unitPrice)} ={" "}
                  <span className="font-medium text-slate-900">{formatMoney(item.lineTotal)}</span>
                </span>
              </li>
            ))}
          </ul>
          {hiddenItems > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + ITEMS_PAGE_SIZE)}
              className="btn btn-secondary mt-3"
            >
              Show more ({hiddenItems} remaining)
            </button>
          )}
        </div>
      </div>
    </Page>
  );
}
