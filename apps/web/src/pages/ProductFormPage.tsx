import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { createProduct, fetchProduct, updateProduct } from "../api/products.js";
import type { CreateProductInput } from "../api/products.js";

interface FormValues {
  name: string;
  sku: string;
  description: string;
  category: string;
  price: string;
  stock: string;
  weightKg: string;
}

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const WEIGHT_PATTERN = /^\d+(\.\d{1,3})?$/;

const EMPTY_VALUES: FormValues = {
  name: "",
  sku: "",
  description: "",
  category: "",
  price: "",
  stock: "",
  weightKg: "",
};

export function validateProductForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.name.trim() === "") {
    errors.name = "Name is required.";
  } else if (values.name.length > 200) {
    errors.name = "Name must be 200 characters or fewer.";
  }
  if (values.sku.trim() === "") {
    errors.sku = "SKU is required.";
  } else if (values.sku.length > 64) {
    errors.sku = "SKU must be 64 characters or fewer.";
  }
  if (values.description.length > 2000) {
    errors.description = "Description must be 2000 characters or fewer.";
  }
  if (values.category.trim() === "") {
    errors.category = "Category is required.";
  } else if (values.category.length > 100) {
    errors.category = "Category must be 100 characters or fewer.";
  }
  if (values.price.trim() === "") {
    errors.price = "Price is required.";
  } else if (!PRICE_PATTERN.test(values.price.trim())) {
    errors.price = "Price must be a nonnegative amount with at most two decimals.";
  }
  if (values.stock.trim() === "") {
    errors.stock = "Stock is required.";
  } else if (!/^\d+$/.test(values.stock.trim())) {
    errors.stock = "Stock must be a nonnegative whole number.";
  }
  if (values.weightKg.trim() === "") {
    errors.weightKg = "Weight is required.";
  } else if (!WEIGHT_PATTERN.test(values.weightKg.trim())) {
    errors.weightKg = "Weight must be a nonnegative amount with at most three decimals.";
  }
  return errors;
}

function toCreateInput(values: FormValues): CreateProductInput {
  return {
    name: values.name,
    sku: values.sku,
    description: values.description,
    category: values.category,
    price: values.price.trim(),
    stock: Number.parseInt(values.stock.trim(), 10),
    weightKg: values.weightKg.trim(),
  };
}

const FIELDS: Array<{ key: keyof FormValues; label: string; type: string; hint: string }> = [
  { key: "name", label: "Name", type: "text", hint: "Up to 200 characters." },
  { key: "sku", label: "SKU", type: "text", hint: "Unique identifier, case-insensitive." },
  {
    key: "description",
    label: "Description",
    type: "text",
    hint: "Optional, up to 2000 characters.",
  },
  { key: "category", label: "Category", type: "text", hint: "Free-form category name." },
  { key: "price", label: "Price (USD)", type: "text", hint: "Example 19.99." },
  { key: "stock", label: "Stock", type: "number", hint: "Whole units available." },
  { key: "weightKg", label: "Weight (kg)", type: "text", hint: "Example 0.350." },
];

export function ProductFormPage({ mode }: { mode: "create" | "edit" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loaded, setLoaded] = useState(mode === "create");

  const existing = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(apiBaseUrl, id ?? ""),
    enabled: mode === "edit" && id !== undefined && id !== "",
  });

  useEffect(() => {
    if (mode === "edit" && !loaded && existing.data !== undefined) {
      setValues({
        name: existing.data.name,
        sku: existing.data.sku,
        description: existing.data.description,
        category: existing.data.category,
        price: existing.data.price,
        stock: String(existing.data.stock),
        weightKg: existing.data.weightKg,
      });
      setLoaded(true);
    }
  }, [mode, loaded, existing.data]);

  const mutation = useMutation({
    mutationFn: async (input: CreateProductInput) => {
      if (mode === "edit") {
        return updateProduct(apiBaseUrl, id ?? "", input);
      }
      return createProduct(apiBaseUrl, input);
    },
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      void navigate(`/products/${product.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "SKU_EXISTS") {
        setErrors((current) => ({ ...current, sku: "This SKU is already in use." }));
        return;
      }
      const message = error instanceof Error ? error.message : "Save failed.";
      setErrors((current) => ({ ...current, form: message }));
    },
  });

  if (mode === "edit" && (id === undefined || id === "")) {
    return <p role="alert">Missing product id.</p>;
  }

  if (mode === "edit" && (existing.isPending || !loaded)) {
    return <p role="status">Loading product…</p>;
  }

  if (mode === "edit" && existing.isError) {
    return (
      <p role="alert">
        Product failed to load.{" "}
        <Link to="/" className="text-blue-700 hover:underline">
          Back to catalog
        </Link>
      </p>
    );
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }
    const validation = validateProductForm(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }
    mutation.mutate(toCreateInput(values));
  }

  return (
    <section aria-label={mode === "create" ? "New product" : "Edit product"}>
      <h2 className="text-xl font-semibold text-slate-900">
        {mode === "create" ? "New product" : "Edit product"}
      </h2>
      <form noValidate onSubmit={handleSubmit} className="mt-4 grid max-w-xl gap-4">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={`product-${field.key}`}
              className="block text-sm font-medium text-slate-700"
            >
              {field.label}
            </label>
            <input
              id={`product-${field.key}`}
              type={field.type}
              min={field.key === "stock" ? 0 : undefined}
              step={field.key === "stock" ? 1 : undefined}
              value={values[field.key]}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              aria-invalid={errors[field.key] !== undefined}
              aria-describedby={
                errors[field.key] !== undefined ? `product-${field.key}-error` : undefined
              }
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <p className="mt-0.5 text-xs text-slate-500">{field.hint}</p>
            {errors[field.key] !== undefined && (
              <p
                id={`product-${field.key}-error`}
                role="alert"
                className="mt-0.5 text-sm text-red-700"
              >
                {errors[field.key]}
              </p>
            )}
          </div>
        ))}
        {errors.form !== undefined && (
          <p role="alert" className="text-sm text-red-700">
            {errors.form}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-blue-700 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
          </button>
          <Link
            to={mode === "edit" && id ? `/products/${id}` : "/"}
            className="rounded border border-slate-300 px-4 py-1.5 text-sm"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
