import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { fetchApiStatus, getApiBaseUrl } from "./api/client.js";
import type { ApiStatus } from "./api/client.js";
import { CartProvider, useCart } from "./cart/CartContext.js";

const initialStatus: ApiStatus = { live: null, ready: null, error: null };

function Shell() {
  const [status, setStatus] = useState<ApiStatus>(initialStatus);
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const cart = useCart();

  useEffect(() => {
    let cancelled = false;
    fetchApiStatus(apiBaseUrl).then((next) => {
      if (!cancelled) {
        setStatus(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            Ecommerce Challenge
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-blue-700 hover:underline">
              Catalog
            </Link>
            <Link to="/products/new" className="text-blue-700 hover:underline">
              New product
            </Link>
            <Link to="/import" className="text-blue-700 hover:underline">
              Import
            </Link>
            <Link to="/cart" className="text-blue-700 hover:underline">
              Cart{cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-6 text-xs text-slate-500">
        {status.error !== null ? (
          <p role="alert">API unreachable: {status.error}</p>
        ) : (
          <p>
            API base URL: {apiBaseUrl} ·{" "}
            {status.ready !== null ? "API connected." : "Checking API status…"}
          </p>
        )}
      </footer>
    </div>
  );
}

export function App() {
  return (
    <CartProvider>
      <Shell />
    </CartProvider>
  );
}
