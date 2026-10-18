import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { fetchApiStatus, getApiBaseUrl } from "./api/client.js";
import type { ApiStatus } from "./api/client.js";
import { CartProvider, useCart } from "./cart/CartContext.js";
import { CartDrawer } from "./components/CartDrawer.js";
import { CartIcon } from "./components/icons.js";

const initialStatus: ApiStatus = { error: null };

function Shell() {
  const [status, setStatus] = useState<ApiStatus>(initialStatus);
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart();
  const location = useLocation();

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

  useEffect(() => {
    setCartOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Ecommerce Challenge
          </Link>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-expanded={cartOpen}
            aria-label={`Cart (${cart.itemCount})`}
            className="btn btn-secondary ml-auto"
          >
            <CartIcon />
            <span className="btn-label">Cart</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                cart.itemCount > 0 ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              {cart.itemCount}
            </span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      {status.error !== null && (
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-red-700">
          <p role="alert">API unreachable: {status.error}</p>
        </footer>
      )}
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
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
