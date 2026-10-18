import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal.js";

function renderModal(onClose = vi.fn()) {
  render(
    <Modal
      title="Dialog title"
      description="Dialog description"
      onClose={onClose}
      closeLabel="Close error details"
      footer={
        <button type="button" onClick={onClose} className="btn btn-primary">
          Confirm
        </button>
      }
    >
      <p>Body copy</p>
      <button type="button">Body action</button>
    </Modal>,
  );
  return onClose;
}

describe("Modal", () => {
  it("exposes modal dialog semantics wired to its title and description", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Dialog title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Dialog description");
    expect(dialog).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Dialog title" })).toBeVisible();
  });

  it("locks background scrolling while open and restores it afterwards", () => {
    const { unmount } = render(
      <Modal title="Dialog title" onClose={vi.fn()}>
        <p>Body copy</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("dismisses on Escape", async () => {
    const onClose = renderModal();
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the header icon", async () => {
    const onClose = renderModal();
    await userEvent.setup().click(screen.getByRole("button", { name: "Close error details" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses when the backdrop is clicked", async () => {
    const onClose = renderModal();
    const backdrop = screen.getByRole("dialog").parentElement?.firstElementChild;
    if (backdrop === null || backdrop === undefined) {
      throw new Error("expected a backdrop element next to the dialog");
    }
    await userEvent.setup().click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderModal();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    confirm.focus();
    await user.tab();
    expect(document.activeElement).not.toBe(confirm);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it("returns focus to the element that opened it", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open dialog";
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(
      <Modal title="Dialog title" onClose={onClose}>
        <p>Body copy</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
    onClose();
    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("omits the description and footer slots when they are not provided", () => {
    const { container } = render(
      <Modal title="Bare dialog" onClose={vi.fn()}>
        <p>Body copy</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Bare dialog" })).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(container.querySelectorAll("footer")).toHaveLength(0);
  });
});
