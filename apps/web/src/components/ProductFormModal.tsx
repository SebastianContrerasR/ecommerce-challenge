import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, getApiBaseUrl } from "../api/client.js";
import { createProduct, fetchProduct, updateProduct } from "../api/products.js";
import type { CreateProductInput, Product } from "../api/products.js";
import { CheckIcon, CloseIcon, PlusIcon } from "./icons.js";
import { Modal } from "./Modal.js";

export interface FormValues {
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

export function toCreateInput(values: FormValues): CreateProductInput {
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

export function toFormValues(product: Product): FormValues {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: product.category,
    price: product.price,
    stock: String(product.stock),
    weightKg: product.weightKg,
  };
}

interface FieldSpec {
  label: string;
  type: string;
  hint: string;
  suffix?: string;
  screenReaderUnit?: string;
}

const FIELD_SPECS: Record<keyof FormValues, FieldSpec> = {
  name: { label: "Name", type: "text", hint: "Up to 200 characters." },
  sku: { label: "SKU", type: "text", hint: "Unique identifier, case-insensitive." },
  description: {
    label: "Description",
    type: "text",
    hint: "Optional, up to 2000 characters.",
  },
  category: { label: "Category", type: "text", hint: "Free-form category name." },
  price: {
    label: "Price",
    type: "text",
    hint: "Example 19.99.",
    suffix: "USD",
    screenReaderUnit: " (USD)",
  },
  stock: { label: "Stock", type: "number", hint: "Whole units available." },
  weightKg: {
    label: "Weight",
    type: "text",
    hint: "Example 0.350.",
    suffix: "kg",
    screenReaderUnit: " (kg)",
  },
};

const FIELD_ROWS: ReadonlyArray<ReadonlyArray<keyof FormValues>> = [
  ["name", "sku"],
  ["description"],
  ["category", "price"],
  ["stock", "weightKg"],
];

const FIELD_ORDER: ReadonlyArray<keyof FormValues> = FIELD_ROWS.flat();

interface VisibleProductFormErrorsInput {
  values: FormValues;
  touched: ReadonlyArray<keyof FormValues>;
  submitAttempted: boolean;
  skuError: string | undefined;
  formError: string | undefined;
}

export function visibleProductFormErrors({
  values,
  touched,
  submitAttempted,
  skuError,
  formError,
}: VisibleProductFormErrorsInput): FormErrors {
  const errors: FormErrors = {};
  if (formError !== undefined) {
    errors.form = formError;
  }
  const validation = validateProductForm(values);
  for (const key of FIELD_ORDER) {
    const message = validation[key];
    if (message === undefined) {
      continue;
    }
    if (key === "sku" && skuError !== undefined) {
      continue;
    }
    if (submitAttempted || touched.includes(key)) {
      errors[key] = message;
    }
  }
  if (skuError !== undefined) {
    errors.sku = skuError;
  }
  return errors;
}

interface ProductFormModalProps {
  mode: "create" | "edit";
  onClose: () => void;
  onSaved: (product: Product) => void;
  productId?: string | undefined;
}

interface ProductFieldProps {
  fieldKey: keyof FormValues;
  value: string;
  error: string | undefined;
  fullWidth: boolean;
  onChange: (key: keyof FormValues, value: string) => void;
  onTouch: (key: keyof FormValues) => void;
}

function ProductField({ fieldKey, value, error, fullWidth, onChange, onTouch }: ProductFieldProps) {
  const spec = FIELD_SPECS[fieldKey];
  const inputId = `product-${fieldKey}`;
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {spec.label}
        {spec.screenReaderUnit !== undefined && (
          <span className="sr-only">{spec.screenReaderUnit}</span>
        )}
      </label>
      <div className="relative mt-1" data-field={fieldKey}>
        <input
          id={inputId}
          name={fieldKey}
          type={spec.type}
          min={fieldKey === "stock" ? 0 : undefined}
          step={fieldKey === "stock" ? 1 : undefined}
          value={value}
          onChange={(event) => onChange(fieldKey, event.target.value)}
          onBlur={() => onTouch(fieldKey)}
          aria-invalid={error !== undefined}
          aria-describedby={error !== undefined ? `${inputId}-error` : `${inputId}-hint`}
          className={spec.suffix !== undefined ? "input w-full input-has-suffix" : "input w-full"}
        />
        {spec.suffix !== undefined && (
          <span aria-hidden="true" className="input-suffix">
            {spec.suffix}
          </span>
        )}
      </div>
      {error !== undefined ? (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1 flex items-center justify-between gap-2 text-sm text-red-700"
        >
          <span>{error}</span>
          <span className="text-xs text-slate-500">{spec.hint}</span>
        </p>
      ) : (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">
          {spec.hint}
        </p>
      )}
    </div>
  );
}

export function ProductFormModal({ mode, onClose, onSaved, productId }: ProductFormModalProps) {
  const [apiBaseUrl] = useState<string>(() => getApiBaseUrl());
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [touched, setTouched] = useState<ReadonlyArray<keyof FormValues>>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [skuError, setSkuError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [focusFieldKey, setFocusFieldKey] = useState<keyof FormValues | undefined>(undefined);
  const [loaded, setLoaded] = useState(mode === "create");

  const existing = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProduct(apiBaseUrl, productId ?? ""),
    enabled: mode === "edit" && productId !== undefined && productId !== "",
  });

  useEffect(() => {
    if (mode === "edit" && !loaded && existing.data !== undefined) {
      setValues(toFormValues(existing.data));
      setLoaded(true);
    }
  }, [mode, loaded, existing.data]);

  const mutation = useMutation({
    mutationFn: async (input: CreateProductInput) => {
      if (mode === "edit") {
        return updateProduct(apiBaseUrl, productId ?? "", input);
      }
      return createProduct(apiBaseUrl, input);
    },
    onSuccess: (product) => onSaved(product),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "SKU_EXISTS") {
        setSkuError("This SKU is already in use.");
        setFocusFieldKey("sku");
        return;
      }
      setFormError(error instanceof Error ? error.message : "Save failed.");
    },
  });

  const errors = visibleProductFormErrors({
    values,
    touched,
    submitAttempted,
    skuError,
    formError,
  });
  const submitLabel = mutation.isPending
    ? "Saving…"
    : mode === "create"
      ? "Create product"
      : "Save changes";

  useEffect(() => {
    if (focusFieldKey === undefined) {
      return;
    }
    document.getElementById(`product-${focusFieldKey}`)?.focus();
    setFocusFieldKey(undefined);
  }, [focusFieldKey]);

  function markTouched(key: keyof FormValues): void {
    setTouched((current) => (current.includes(key) ? current : [...current, key]));
  }

  function changeField(key: keyof FormValues, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));
    markTouched(key);
    if (key === "sku") {
      setSkuError(undefined);
    }
  }

  function submit(): void {
    if (mutation.isPending) {
      return;
    }
    setSubmitAttempted(true);
    setSkuError(undefined);
    setFormError(undefined);
    const validation = validateProductForm(values);
    if (Object.keys(validation).length > 0) {
      setFocusFieldKey(FIELD_ORDER.find((key) => validation[key] !== undefined));
      return;
    }
    mutation.mutate(toCreateInput(values));
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    submit();
  }

  if (mode === "edit" && productId === undefined) {
    return (
      <Modal title="Edit product" onClose={onClose} width="md" closeLabel="Close edit dialog">
        <p role="alert" className="text-sm text-red-700">
          Missing product id.
        </p>
      </Modal>
    );
  }

  if (mode === "edit" && (existing.isError || (!loaded && !existing.isPending))) {
    return (
      <Modal title="Edit product" onClose={onClose} width="md" closeLabel="Close edit dialog">
        <p role="alert" className="text-sm text-red-700">
          Product failed to load.
        </p>
      </Modal>
    );
  }

  if (mode === "edit" && !loaded) {
    return (
      <Modal title="Edit product" onClose={onClose} width="md" closeLabel="Close edit dialog">
        <p role="status" className="text-sm text-slate-600">
          Loading product…
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={mode === "create" ? "New product" : "Edit product"}
      description={
        mode === "create"
          ? "Prices and stock are stored exactly as entered."
          : "Changes apply to future purchases; past orders keep their snapshot."
      }
      onClose={onClose}
      width="md"
      closeLabel={mode === "create" ? "Close new product dialog" : "Close edit dialog"}
      footer={
        <>
          <button type="button" aria-label="Cancel" onClick={onClose} className="btn btn-secondary">
            <CloseIcon />
            <span className="btn-label">Cancel</span>
          </button>
          <button
            type="button"
            aria-label={submitLabel}
            onClick={() => submit()}
            disabled={mutation.isPending}
            className="btn btn-primary"
          >
            {mode === "create" ? <PlusIcon /> : <CheckIcon />}
            <span className="btn-label">{submitLabel}</span>
          </button>
        </>
      }
    >
      <form
        id="product-form"
        noValidate
        onSubmit={handleSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        {FIELD_ROWS.map((row) =>
          row.map((fieldKey) => (
            <ProductField
              key={fieldKey}
              fieldKey={fieldKey}
              value={values[fieldKey]}
              error={errors[fieldKey]}
              fullWidth={row.length === 1}
              onChange={changeField}
              onTouch={markTouched}
            />
          )),
        )}
        {errors.form !== undefined && (
          <p role="alert" className="alert alert-error sm:col-span-2">
            {errors.form}
          </p>
        )}
      </form>
    </Modal>
  );
}
