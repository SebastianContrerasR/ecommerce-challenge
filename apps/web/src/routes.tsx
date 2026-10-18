import { Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App.js";
import { CatalogPage } from "./pages/CatalogPage.js";
import { ProductDetailPage } from "./pages/ProductDetailPage.js";
import { OrderDetailPage } from "./pages/OrderDetailPage.js";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<App />}>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
