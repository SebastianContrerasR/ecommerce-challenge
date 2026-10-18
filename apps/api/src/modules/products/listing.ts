import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PRODUCT_SORT_DIRECTIONS,
  PRODUCT_SORT_FIELDS,
} from "@ecommerce/api-contracts";
import type { ProductSortDirection, ProductSortField } from "@ecommerce/api-contracts";
import { ProductServiceError } from "./products.errors.js";

export interface RawListQuery {
  q?: string;
  category?: string;
  sort?: string;
  order?: string;
  page?: string;
  pageSize?: string;
  includeArchived?: string;
  inStock?: string;
}

export interface ParsedListQuery {
  searchText?: string | undefined;
  categoryFilter?: string | undefined;
  sort: ProductSortField;
  order: ProductSortDirection;
  page: number;
  pageSize: number;
  includeArchived: boolean;
  inStock: boolean;
}

function isSortField(value: string): value is ProductSortField {
  return (PRODUCT_SORT_FIELDS as readonly string[]).includes(value);
}

function isSortDirection(value: string): value is ProductSortDirection {
  return (PRODUCT_SORT_DIRECTIONS as readonly string[]).includes(value);
}

function parsePage(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ProductServiceError("INVALID_PAGINATION", 400, `Invalid page: ${raw}`, {
      page: raw,
    });
  }
  return parsed;
}

function parsePageSize(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    throw new ProductServiceError("INVALID_PAGINATION", 400, `Invalid pageSize: ${raw}`, {
      pageSize: raw,
      maxPageSize: MAX_PAGE_SIZE,
    });
  }
  return parsed;
}

function parseBooleanFlag(name: string, raw: string | undefined): boolean {
  if (raw === undefined || raw === "") {
    return false;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new ProductServiceError("INVALID_QUERY", 400, `Invalid ${name}: ${raw}`, { [name]: raw });
}

export function parseListQuery(raw: RawListQuery): ParsedListQuery {
  const searchText = raw.q === undefined || raw.q.trim() === "" ? undefined : raw.q.trim();
  const categoryFilter =
    raw.category === undefined || raw.category.trim() === "" ? undefined : raw.category.trim();
  const sortRaw = raw.sort === undefined || raw.sort === "" ? "createdAt" : raw.sort;
  if (!isSortField(sortRaw)) {
    throw new ProductServiceError("INVALID_SORT", 400, `Invalid sort field: ${sortRaw}`, {
      sort: sortRaw,
    });
  }
  const orderRaw = raw.order === undefined || raw.order === "" ? "desc" : raw.order;
  if (!isSortDirection(orderRaw)) {
    throw new ProductServiceError("INVALID_SORT", 400, `Invalid sort direction: ${orderRaw}`, {
      order: orderRaw,
    });
  }
  return {
    searchText,
    categoryFilter,
    sort: sortRaw,
    order: orderRaw,
    page: parsePage(raw.page),
    pageSize: parsePageSize(raw.pageSize),
    includeArchived: parseBooleanFlag("includeArchived", raw.includeArchived),
    inStock: parseBooleanFlag("inStock", raw.inStock),
  };
}
