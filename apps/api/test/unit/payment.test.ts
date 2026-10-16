import { describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../../src/modules/payments/paymentProvider.js";

describe("FakePaymentProvider", () => {
  it("issues globally unique references across provider instances", async () => {
    const first = new FakePaymentProvider();
    const second = new FakePaymentProvider();
    const [chargeA, chargeB] = await Promise.all([
      first.charge({ amount: "10.00", idempotencyKey: "key-a" }),
      second.charge({ amount: "10.00", idempotencyKey: "key-b" }),
    ]);
    expect(chargeA.outcome).toBe("succeeded");
    expect(chargeB.outcome).toBe("succeeded");
    if (chargeA.outcome === "succeeded" && chargeB.outcome === "succeeded") {
      expect(chargeA.reference).not.toBe(chargeB.reference);
    }
  });

  it("issues distinct references for sequential charges", async () => {
    const payment = new FakePaymentProvider();
    const first = await payment.charge({ amount: "10.00", idempotencyKey: "key-a" });
    const second = await payment.charge({ amount: "10.00", idempotencyKey: "key-b" });
    if (first.outcome === "succeeded" && second.outcome === "succeeded") {
      expect(first.reference).not.toBe(second.reference);
      expect(payment.charges).toHaveLength(2);
    } else {
      throw new Error("Expected succeeding charges");
    }
  });

  it("records voids against the charged reference", async () => {
    const payment = new FakePaymentProvider();
    const charge = await payment.charge({ amount: "10.00", idempotencyKey: "key-a" });
    if (charge.outcome !== "succeeded") {
      throw new Error("Expected succeeding charge");
    }
    await payment.void(charge.reference);
    expect(payment.voids).toEqual([charge.reference]);
  });

  it("declines every charge when configured to decline", async () => {
    const payment = new FakePaymentProvider("decline");
    const charge = await payment.charge({ amount: "10.00", idempotencyKey: "key-a" });
    expect(charge).toEqual({ outcome: "declined", reason: "Card declined by fake provider" });
  });
});
