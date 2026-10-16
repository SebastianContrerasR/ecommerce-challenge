import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { addToCart, cartItemCount, removeFromCart, setEntryQuantity } from "./cart.js";
import type { CartEntry, CartProductSnapshot } from "./cart.js";

const STORAGE_KEY = "ecommerce-cart-v1";

interface StoredEntry {
  product: CartProductSnapshot;
  quantity: number;
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as { product?: unknown; quantity?: unknown };
  if (typeof entry.product !== "object" || entry.product === null) {
    return false;
  }
  const product = entry.product as {
    id?: unknown;
    name?: unknown;
    sku?: unknown;
    price?: unknown;
    stock?: unknown;
  };
  return (
    typeof product.id === "string" &&
    typeof product.name === "string" &&
    typeof product.sku === "string" &&
    typeof product.price === "string" &&
    typeof product.stock === "number" &&
    typeof entry.quantity === "number"
  );
}

function loadCart(): CartEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isStoredEntry).map((entry) => ({
      product: {
        id: entry.product.id,
        name: entry.product.name,
        sku: entry.product.sku,
        price: entry.product.price,
        stock: entry.product.stock,
        archivedAt: null,
      },
      quantity: Math.max(1, Math.floor(entry.quantity)),
    }));
  } catch {
    return [];
  }
}

interface CartContextValue {
  entries: CartEntry[];
  itemCount: number;
  addItem: (product: CartProductSnapshot, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>(loadCart);

  const persist = useCallback((next: CartEntry[]) => {
    setEntries(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      entries,
      itemCount: cartItemCount(entries),
      addItem: (product, quantity) => persist(addToCart(entries, product, quantity)),
      setQuantity: (productId, quantity) => persist(setEntryQuantity(entries, productId, quantity)),
      removeItem: (productId) => persist(removeFromCart(entries, productId)),
      clear: () => persist([]),
    }),
    [entries, persist],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (context === null) {
    throw new Error("useCart requires a CartProvider");
  }
  return context;
}
