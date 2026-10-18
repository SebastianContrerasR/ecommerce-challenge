import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, Page, PageHeader, SectionHeading } from "./Page.js";

describe("Page", () => {
  it("labels the landmark and centers the content column", () => {
    render(
      <Page label="Order detail" width="narrow">
        <p>content</p>
      </Page>,
    );
    const section = screen.getByRole("region", { name: "Order detail" });
    expect(section).toHaveClass("mx-auto", "max-w-2xl");
  });

  it("lets a wide page fill the shell without a width cap", () => {
    render(
      <Page label="Product catalog" width="wide">
        <p>content</p>
      </Page>,
    );
    expect(screen.getByRole("region", { name: "Product catalog" }).className).not.toContain(
      "max-w-",
    );
  });

  it("defaults to the medium column", () => {
    render(
      <Page label="Shopping cart">
        <p>content</p>
      </Page>,
    );
    expect(screen.getByRole("region", { name: "Shopping cart" })).toHaveClass("max-w-3xl");
  });
});

describe("PageHeader", () => {
  it("renders the title as the page heading with an optional description", () => {
    render(<PageHeader title="Import products from CSV" description="Accepted file: .csv" />);
    expect(screen.getByRole("heading", { name: "Import products from CSV" })).toBeInTheDocument();
    expect(screen.getByText("Accepted file: .csv")).toBeVisible();
  });

  it("omits the description paragraph when none is given", () => {
    const { container } = render(<PageHeader title="Shopping cart" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("SectionHeading", () => {
  it("renders metadata and an action beside the heading", () => {
    render(
      <SectionHeading
        title="Recently added products"
        meta="Showing the 20 newest of 143 products."
        action={<a href="/">Browse all in catalog</a>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Recently added products" })).toBeVisible();
    expect(screen.getByText("Showing the 20 newest of 143 products.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Browse all in catalog" })).toBeVisible();
  });
});

describe("EmptyState", () => {
  it("shows the title, supporting text, and call to action", () => {
    render(
      <EmptyState title="No products yet" action={<a href="/products/new">Create product</a>}>
        Products you create or import will appear here.
      </EmptyState>,
    );
    expect(screen.getByText("No products yet")).toBeVisible();
    expect(screen.getByText("Products you create or import will appear here.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Create product" })).toBeVisible();
  });
});
