import { randomUUID } from "node:crypto";

export interface ChargeRequest {
  amount: string;
  idempotencyKey: string;
}

export type ChargeOutcome =
  | { outcome: "succeeded"; reference: string }
  | { outcome: "declined"; reason: string };

export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeOutcome>;
  void(reference: string): Promise<void>;
}

export type FakePaymentBehavior = "succeed" | "decline";

export class FakePaymentProvider implements PaymentProvider {
  readonly charges: ChargeRequest[] = [];
  readonly voids: string[] = [];
  private counter = 0;

  constructor(private readonly behavior: FakePaymentBehavior = "succeed") {}

  async charge(request: ChargeRequest): Promise<ChargeOutcome> {
    this.charges.push(request);
    if (this.behavior === "decline") {
      return { outcome: "declined", reason: "Card declined by fake provider" };
    }
    this.counter += 1;
    return { outcome: "succeeded", reference: `fake_pay_${this.counter}_${randomUUID()}` };
  }

  async void(reference: string): Promise<void> {
    this.voids.push(reference);
  }
}
