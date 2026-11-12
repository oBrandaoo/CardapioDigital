// Paid song requests only work where a payment confirmation exists. Today that
// is the local mock (development only); no real provider is connected yet.
// When a real provider is enabled, update this single check.
export function paidRequestsAvailable() {
  return process.env.NODE_ENV === "development";
}
