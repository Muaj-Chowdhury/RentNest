import config from "../config";
import { PaymentsService } from "../modules/payments/payments.service";

/*
 * Payment reservation expiry is deliberately implemented as a small internal
 * worker instead of an HTTP endpoint.
 *
 * Why? A tenant must not be able to choose when their own reservation expires,
 * and an external caller should not be able to release someone else's
 * property. The worker runs inside the API process and uses the same database
 * transaction as the payment lifecycle.
 *
 * In a multi-instance deployment every API instance may run this check. That
 * is safe because expirePaymentReservations() uses conditional updates: only
 * the transaction that still sees APPROVED can expire a request. A dedicated
 * queue/cron service can replace this worker later without changing the
 * expiration business logic.
 */
export const startPaymentReservationExpiryJob = () => {
  const paymentsService = new PaymentsService();
  const configuredInterval =
    config.payment_reservation_expiry_check_interval_ms;
  const intervalMs =
    Number.isFinite(configuredInterval) && configuredInterval > 0
      ? configuredInterval
      : 60_000;

  const run = async () => {
    try {
      const result = await paymentsService.expirePaymentReservations();

      if (result.expiredCount > 0) {
        console.log(
          `[payment-expiry] Expired ${result.expiredCount} reservation(s)`,
        );
        console.log(
          new Date().toISOString(),
          `[payment-expiry] Next check in ${intervalMs} ms`,
        )
      }
    } catch (error) {
      // A failed cleanup pass must not crash the API process. The next
      // interval will retry, and the error remains visible in server logs.
      console.error("[payment-expiry] Cleanup failed", error);
    }
  };

  // Run once at startup so already-expired reservations are cleaned promptly.
  void run();

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  // The timer should not keep a graceful shutdown hanging if the HTTP server
  // has already stopped for another reason.
  timer.unref();

  return timer;
};
