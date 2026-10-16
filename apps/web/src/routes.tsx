import { Route, Routes } from "react-router-dom";
import { App } from "./App.js";
import { CatalogPage } from "./pages/CatalogPage.js";
import { ProductDetailPage } from "./pages/ProductDetailPage.js";
import { ProductFormPage } from "./pages/ProductFormPage.js";
import { ImportPage } from "./pages/ImportPage.js";
import { CartPage } from "./pages/CartPage.js";
import { OrderDetailPage } from "./pages/OrderDetailPage.js";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<App />}>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/products/new" element={<ProductFormPage mode="create" />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/products/:id/edit" element={<ProductFormPage mode="edit" />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
      </Route>
    </Routes>
  );
}
