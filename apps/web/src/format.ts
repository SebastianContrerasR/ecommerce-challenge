const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMoney(value: string): string {
  return usdFormatter.format(Number(value));
}

export function formatWeight(value: string): string {
  return `${value} kg`;
}

export function estimateSubtotal(lines: Array<{ price: string; quantity: number }>): string {
  let totalCents = 0n;
  for (const line of lines) {
    const dot = line.price.indexOf(".");
    const whole = dot === -1 ? line.price : line.price.slice(0, dot);
    const fraction = dot === -1 ? "00" : `${line.price.slice(dot + 1)}00`.slice(0, 2);
    totalCents +=
      (BigInt(whole === "" ? "0" : whole) * 100n + BigInt(fraction)) * BigInt(line.quantity);
  }
  return `${(totalCents / 100n).toString()}.${(totalCents % 100n).toString().padStart(2, "0")}`;
}
