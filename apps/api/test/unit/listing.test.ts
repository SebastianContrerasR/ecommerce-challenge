import { describe, expect, it } from "vitest";
import { parseListQuery } from "../../src/modules/products/listing.js";
import { ProductServiceError } from "../../src/modules/products/products.errors.js";

function expectServiceErrorCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ProductServiceError);
    expect((error as ProductServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ProductServiceError with code ${code}`);
}

describe("parseListQuery", () => {
  it("applies defaults for an empty query", () => {
    expect(parseListQuery({})).toEqual({
      searchText: undefined,
      categoryFilter: undefined,
      sort: "createdAt",
      order: "desc",
      page: 1,
      pageSize: 20,
      includeArchived: false,
      inStock: false,
    });
  });

  it("trims search text and category", () => {
    const parsed = parseListQuery({ q: "  shoes ", category: " Footwear " });
    expect(parsed.searchText).toBe("shoes");
    expect(parsed.categoryFilter).toBe("Footwear");
  });

  it("treats blank search text as absent", () => {
    expect(parseListQuery({ q: "   " }).searchText).toBe(undefined);
  });

  it("parses pagination and flags", () => {
    const parsed = parseListQuery({
      page: "2",
      pageSize: "5",
      sort: "price",
      order: "asc",
      includeArchived: "true",
      inStock: "true",
    });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(5);
    expect(parsed.sort).toBe("price");
    expect(parsed.order).toBe("asc");
    expect(parsed.includeArchived).toBe(true);
    expect(parsed.inStock).toBe(true);
  });

  it("treats inStock=false and blank flags as no stock restriction", () => {
    expect(parseListQuery({ inStock: "false" }).inStock).toBe(false);
    expect(parseListQuery({ inStock: "" }).inStock).toBe(false);
    expect(parseListQuery({ includeArchived: "" }).includeArchived).toBe(false);
  });

  it("rejects unknown sort fields", () => {
    expectServiceErrorCode(() => parseListQuery({ sort: "color" }), "INVALID_SORT");
  });

  it("rejects unknown sort directions", () => {
    expectServiceErrorCode(() => parseListQuery({ order: "sideways" }), "INVALID_SORT");
  });

  it("rejects out of range pagination", () => {
    expectServiceErrorCode(() => parseListQuery({ page: "0" }), "INVALID_PAGINATION");
    expectServiceErrorCode(() => parseListQuery({ pageSize: "0" }), "INVALID_PAGINATION");
    expectServiceErrorCode(() => parseListQuery({ pageSize: "101" }), "INVALID_PAGINATION");
  });

  it("rejects unknown includeArchived values", () => {
    expectServiceErrorCode(() => parseListQuery({ includeArchived: "yes" }), "INVALID_QUERY");
  });

  it("rejects unknown inStock values", () => {
    expectServiceErrorCode(() => parseListQuery({ inStock: "1" }), "INVALID_QUERY");
  });
});
