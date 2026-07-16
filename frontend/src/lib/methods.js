export const PAYMENT_METHODS = [
  { value: "Cash", label: "Cash", chipClass: "method-cash" },
  { value: "Bank Transfer (Tanay ICICI)", label: "Bank Transfer (Tanay ICICI)", chipClass: "method-icici" },
  { value: "Bank Transfer (Tanay UTK)", label: "Bank Transfer (Tanay UTK)", chipClass: "method-utk" },
];
export const DEFAULT_METHOD = "Cash";

export function methodChipClass(method) {
  return PAYMENT_METHODS.find((m) => m.value === method)?.chipClass || "bg-muted text-muted-foreground";
}
