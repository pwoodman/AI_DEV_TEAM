export function printInvoice(amount: number): string {
  return "Invoice: " + "$" + amount.toFixed(2);
}

export function printReceipt(amount: number): string {
  return "Receipt: " + "$" + amount.toFixed(2);
}
