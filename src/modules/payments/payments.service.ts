import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import {
  PaymentProvider,
  PaymentStatus,
  RentalRequestStatus,
  Role,
} from "../../../generated/prisma/enums";
import config from "../../config";
import prisma from "../../lib/prisma";
import { GatewayPayload, ICreatePaymentPayload } from "./payments.interface";

type PaymentActor = {
  id: string;
  role: Role;
};

type PaymentFailureStatus =
  | typeof PaymentStatus.FAILED
  | typeof PaymentStatus.CANCELLED;

/*
 * Important payment design:
 *
 * Payment is the summary record for one approved rental request.
 * PaymentAttempt is one actual SSLCommerz transaction/session.
 *
 * One Payment may therefore have many attempts:
 *
 *   Payment
 *     ├── Attempt 1: CANCELLED
 *     ├── Attempt 2: FAILED
 *     └── Attempt 3: COMPLETED
 *
 * We keep every attempt because SSLCommerz may send a delayed IPN for an
 * older transaction after the tenant has already started a retry. If we
 * stored only the newest transactionId, the older callback could not be
 * identified safely.
 */

type SSLSessionResponse = {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
};

type SSLValidationResponse = {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  currency?: string;
  currency_type?: string;
  risk_level?: string;
};

class GatewayRequestUncertainError extends Error {
  readonly code = "GATEWAY_REQUEST_UNCERTAIN";
  readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "GatewayRequestUncertainError";
  }
}

class PaymentSessionInProgressError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "PaymentSessionInProgressError";
  }
}

const paymentSelect: Prisma.PaymentSelect = {
  id: true,
  rentalRequestId: true,
  transactionId: true,
  provider: true,
  amount: true,
  currency: true,
  status: true,
  gatewaySessionId: true,
  gatewayPageUrl: true,
  validationId: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  attempts: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      transactionId: true,
      amount: true,
      currency: true,
      status: true,
      gatewaySessionId: true,
      gatewayPageUrl: true,
      validationId: true,
      failureReason: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  rentalRequest: {
    select: {
      id: true,
      status: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      property: {
        select: {
          id: true,
          title: true,
          location: true,
          rent: true,
        },
      },
    },
  },
};

export class PaymentsService {
  private getRequestTimeoutMs() {
    const timeoutMs = config.sslcommerz_request_timeout_ms;

    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000 // 15 seconds;
  }

  private getUncertainRetryAfterMs() {
    const retryAfterMs = config.sslcommerz_uncertain_retry_after_ms;

    return Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? retryAfterMs
      : Math.max(this.getRequestTimeoutMs() * 2, 30_000); // 30 seconds
  }


  private getSessionUrl() {
    // This endpoint creates an SSLCommerz checkout session. The sandbox URL
    // must be used while learning/testing; production is selected through env.
    return config.sslcommerz_env === "production"
      ? "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
      : "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
  }

  private getValidationUrl() {
    // This endpoint is called by our backend to verify a successful payment.
    // Never trust only the browser success callback or the IPN body.
    return config.sslcommerz_env === "production"
      ? "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
      : "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";
  }

  private getCallbackUrl(path: string) {
    // SSLCommerz must be able to reach these public URLs. They are not browser
    // frontend URLs; they are backend callback endpoints exposed through ngrok
    // during local development.
    return `${config.public_api_url.replace(/\/$/, "")}/api/payments/${path}`;
  }

  private generateTransactionId() {
    // A normal retry receives a new unique transaction ID. The only exception
    // is an uncertain session request, which deliberately reuses its original
    // transaction ID to avoid a possible duplicate charge.
    return `RN${Date.now().toString(36)}${randomBytes(8)
      .toString("hex")
      .toUpperCase()}`;
  }

  private readString(payload: GatewayPayload, key: string) {
    const value = payload[key];
    return typeof value === "string" ? value : undefined;
  }

  private amountsMatch(expected: unknown, actual: unknown) {
    // The amount comes from our database, never from the tenant request body.
    // Comparing two decimal strings rounded to two places avoids small numeric
    // representation differences while still rejecting a real mismatch.
    const expectedAmount = Number(expected);
    const actualAmount = Number(actual);

    return (
      Number.isFinite(expectedAmount) &&
      Number.isFinite(actualAmount) &&
      expectedAmount.toFixed(2) === actualAmount.toFixed(2)
    );
  }

  private verifyGatewaySignature(payload: GatewayPayload) {
    // IPN/callback payloads come from the public internet. The signature check
    // helps reject forged notifications before any payment state is changed.
    // Successful payments are still validated separately with SSLCommerz.
    const verifySign = this.readString(payload, "verify_sign");
    const verifyKey = this.readString(payload, "verify_key");
    const storeId = this.readString(payload, "store_id");

    if (!verifySign || !verifyKey) {
      return false;
    }

    if (storeId && storeId !== config.sslcommerz_store_id) {
      return false;
    }

    const values: Record<string, string> = {};

    // SSLCommerz gives verify_key as a comma-separated list. We rebuild the
    // signed value using only those fields, add the MD5 store password, and
    // compare the result with verify_sign.
    for (const key of verifyKey.split(",")) {
      const value = this.readString(payload, key);

      if (value !== undefined) {
        values[key] = value;
      }
    }

    values.store_passwd = createHash("md5")
      .update(config.sslcommerz_store_password)
      .digest("hex");

    const serialized = Object.keys(values)
      .sort()
      .map((key) => `${key}=${values[key]}`)
      .join("&");

    const expectedSignature = createHash("md5")
      .update(serialized)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(verifySign);

    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }
  private async fetchWithTimeout(
    input: string | URL,
    init: RequestInit = {},
    timeoutMs = this.getRequestTimeoutMs(),
  ) {
    // A network request without a timeout could leave a payment attempt stuck
    // forever. If the request is interrupted after it reaches SSLCommerz, the
    // result is uncertain: the gateway may have created a session even though
    // our server did not receive the response.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new GatewayRequestUncertainError(
          `SSLCommerz did not respond within ${timeoutMs}ms. The payment session may have been created; retry after a short delay.`,
        );
      }

      if (error instanceof TypeError) {
        throw new GatewayRequestUncertainError(
          "SSLCommerz could not be reached. The payment session status is uncertain; retry after a short delay.",
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  private async createGatewaySession(input: {
    amount: string;
    transactionId: string;
    propertyTitle: string;
    customerName: string;
    customerEmail: string;
    phone: string;
    address: string;
    city: string;
    postcode: string;
  }) {
    // This method only talks to SSLCommerz. It does not mark the rental active
    // and it does not mark the payment completed. At this point we are only
    // obtaining a checkout URL for the customer.
    const form = new URLSearchParams({
      store_id: config.sslcommerz_store_id,
      store_passwd: config.sslcommerz_store_password,
      total_amount: input.amount,
      currency: "BDT",
      tran_id: input.transactionId,

      success_url: this.getCallbackUrl("success"),
      fail_url: this.getCallbackUrl("fail"),
      cancel_url: this.getCallbackUrl("cancel"),
      ipn_url: this.getCallbackUrl("ipn"),

      cus_name: input.customerName,
      cus_email: input.customerEmail,
      cus_add1: input.address,
      cus_city: input.city,
      cus_postcode: input.postcode,
      cus_country: "Bangladesh",
      cus_phone: input.phone,

      shipping_method: "NO",
      num_of_item: "1",

      product_name: input.propertyTitle,
      product_category: "Property Rent",
      product_profile: "general",
    });

    const response = await this.fetchWithTimeout(this.getSessionUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    let result: SSLSessionResponse;

    try {
      result = (await response.json()) as SSLSessionResponse;
    } catch {
      throw new GatewayRequestUncertainError(
        "SSLCommerz returned an unreadable response. The payment session status is uncertain; retry after a short delay.",
      );
    }

    // A successful HTTP response alone is not enough. SSLCommerz must return
    // both SUCCESS and a usable GatewayPageURL/sessionkey.
    if (!response.ok || result.status !== "SUCCESS") {
      throw new Error(result.failedreason || "SSLCommerz session creation failed");
    }

    if (!result.sessionkey || !result.GatewayPageURL) {
      throw new GatewayRequestUncertainError(
        "SSLCommerz reported success without a usable checkout session. The payment session status is uncertain; retry after a short delay.",
      );
    }

    return result;
  }

  private async validateWithGateway(
    validationId: string,
  ): Promise<SSLValidationResponse> {
    // The val_id is supplied by SSLCommerz after checkout. The backend sends
    // it back to SSLCommerz and receives the authoritative payment result.
    // If this request times out, we do not assume success or failure; the IPN
    // may arrive later and can retry this validation.
    const url = new URL(this.getValidationUrl());

    url.searchParams.set("val_id", validationId);
    url.searchParams.set("store_id", config.sslcommerz_store_id);
    url.searchParams.set("store_passwd", config.sslcommerz_store_password);
    url.searchParams.set("format", "json");
    url.searchParams.set("v", "1");

    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error("Unable to validate payment with SSLCommerz");
    }

    return (await response.json()) as SSLValidationResponse;
  }

  async createPayment(payload: ICreatePaymentPayload, tenantId: string) {
    /*
     * CREATE PAYMENT FLOW
     *
     * This endpoint prepares one gateway attempt. It does not mean that the
     * customer has paid yet.
     *
     *   1. Confirm the authenticated tenant owns the rental request.
     *   2. Confirm the landlord already approved the request.
     *   3. Calculate the amount from Property.rent on the server.
     *   4. Reuse an unfinished gateway session when it is still available.
     *   5. Otherwise create a new transaction and PaymentAttempt, unless the
     *      previous session request is uncertain and can be safely recovered.
     *   6. Ask SSLCommerz for a GatewayPageURL.
     *   7. Return the URL to the API caller so the customer can pay.
     *
     * The response from this method means "checkout session ready", not
     * "payment completed". Completion happens later through IPN/callback
     * processing and confirmPayment().
     */
    if (!payload?.rentalRequestId) {
      throw new Error("rentalRequestId is required");
    }

    if (!payload.phone) {
      throw new Error("Tenant phone number is required");
    }

    const preparedPayment = await prisma.$transaction(
      async (tx) => {
        // This database transaction protects the initial checkpoint. The
        // gateway call is intentionally made after this transaction because
        // external HTTP calls should not remain inside a database transaction.
        const request = await tx.rentalRequest.findUnique({
          where: {
            id: payload.rentalRequestId,
          },
          select: {
            id: true,
            tenantId: true,
            status: true,
            payment: {
              select: {
                id: true,
                transactionId: true,
                amount: true,
                currency: true,
                status: true,
                gatewayPageUrl: true,
                attempts: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    id: true,
                    transactionId: true,
                    status: true,
                    gatewaySessionId: true,
                    gatewayPageUrl: true,
                    validationId: true,
                    failureReason: true,
                    updatedAt: true,
                  },
                },
              },
            },
            property: {
              select: {
                title: true,
                rent: true,
              },
            },
            tenant: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        });

        if (!request) {
          throw new Error("Rental request not found");
        }

        if (request.tenantId !== tenantId) {
          // tenantId comes from authentication, never from the request body.
          throw new Error("You cannot pay for another tenant's request");
        }

        const existingPayment = request.payment;

        if (existingPayment?.status === PaymentStatus.COMPLETED) {
          // The rental has already been paid. A new checkout session would risk
          // charging the tenant twice.
          throw new Error("This rental request has already been paid");
        }

        if (request.status !== RentalRequestStatus.APPROVED) {
          // Payment is allowed only after the landlord/admin approves the
          // rental request. A FAILED/CANCELLED gateway attempt does not change
          // this request status, so the tenant can retry.
          throw new Error("Only approved rental requests can be paid");
        }
        // The customer cannot choose or modify the payment amount.
        const amount = request.property.rent.toFixed(2);

        if (Number(amount) < 10 || Number(amount) > 500000) {
          throw new Error(
            "Payment amount must be between 10.00 and 500000.00 BDT",
          );
        }
       //1st scenario----------------------------------------------
        if (
          existingPayment &&
          (existingPayment.status === PaymentStatus.PENDING ||
            existingPayment.status === PaymentStatus.PROCESSING) &&
          existingPayment.gatewayPageUrl &&
          existingPayment.attempts[0] &&
          existingPayment.attempts[0].transactionId ===
            existingPayment.transactionId
        ) {
          // The tenant called create-payment again while the previous session
          // is still pending. Return the same URL instead of creating another
          // gateway transaction. This is the meaning of existingSession=true.
          return {
            paymentId: existingPayment.id,
            attemptId: existingPayment.attempts[0].id,
            rentalRequestId: request.id,
            transactionId: existingPayment.transactionId,
            amount: existingPayment.amount.toString(),
            currency: existingPayment.currency,
            status: existingPayment.status,
            propertyTitle: request.property.title,
            customerName: request.tenant.name,
            customerEmail: request.tenant.email,
            gatewayPageUrl: existingPayment.gatewayPageUrl,
            phone: payload.phone,
            address: payload.address ?? "Dhaka",
            city: payload.city ?? "Dhaka",
            postcode: payload.postcode ?? "1000",
            existingSession: true,
            sessionRetry: false,
          };
        }
       
       //2nd scenario----------------------------------------------
        const latestAttempt = existingPayment?.attempts[0];

        if (
          existingPayment &&
          latestAttempt?.failureReason === "PAYMENT_VALIDATION_IN_PROGRESS"
        ) {
          throw new PaymentSessionInProgressError(
            "Payment validation is still in progress. Please wait for the gateway result.",
          );
        }

        const sessionCreationHasNoUrl =
          existingPayment &&
          latestAttempt &&
          !existingPayment.gatewayPageUrl &&
          !latestAttempt.gatewayPageUrl &&
          !latestAttempt.gatewaySessionId &&
          !latestAttempt.validationId &&
          latestAttempt.failureReason !== "PAYMENT_VALIDATION_IN_PROGRESS" &&
          (existingPayment.status === PaymentStatus.PENDING ||
            existingPayment.status === PaymentStatus.PROCESSING) &&
          (latestAttempt.status === PaymentStatus.PENDING ||
            latestAttempt.status === PaymentStatus.PROCESSING);

        if (existingPayment && latestAttempt && sessionCreationHasNoUrl) {
          const retryAfterMs = this.getUncertainRetryAfterMs();
          const ageMs = Date.now() - latestAttempt.updatedAt.getTime();

          if (ageMs < retryAfterMs) {
            throw new PaymentSessionInProgressError(
              `Payment session creation is still being reconciled. Please retry in ${Math.ceil(
                (retryAfterMs - ageMs) / 1000,
              )} seconds.`,
            );
          }

          // Claim the recovery attempt inside the serializable transaction.
          // This refreshes updatedAt, so two simultaneous retry requests cannot
          // both call SSLCommerz with the same transaction ID.
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: { status: PaymentStatus.PROCESSING },
          });

          await tx.paymentAttempt.update({
            where: { id: latestAttempt.id },
            data: {
              status: PaymentStatus.PROCESSING,
              failureReason: "SESSION_CREATION_RETRY_IN_PROGRESS",
            },
          });

          // Reuse the same transaction ID after an uncertain request. This is
          // important: creating a new attempt here could charge the tenant
          // twice if SSLCommerz accepted the original request before our
          // timeout/network failure.
          return {
            paymentId: existingPayment.id,
            attemptId: latestAttempt.id,
            rentalRequestId: request.id,
            transactionId: existingPayment.transactionId,
            amount: existingPayment.amount.toString(),
            currency: existingPayment.currency,
            status: PaymentStatus.PROCESSING,
            propertyTitle: request.property.title,
            customerName: request.tenant.name,
            customerEmail: request.tenant.email,
            gatewayPageUrl: null,
            phone: payload.phone,
            address: payload.address ?? "Dhaka",
            city: payload.city ?? "Dhaka",
            postcode: payload.postcode ?? "1000",
            existingSession: false,
            sessionRetry: true,
          };
        }

        //3rd scenario----------------------------------------------------------

        // There is no reusable active session, so this is a new attempt. This
        // happens after a definitive gateway failure or customer cancellation.
        const transactionId = this.generateTransactionId();

        const payment = existingPayment
          ? await tx.payment.update({
              where: {
                id: existingPayment.id,
              },
              data: {
                transactionId,
                provider: PaymentProvider.SSLCOMMERZ,
                amount: request.property.rent,
                currency: "BDT",
                status: PaymentStatus.PROCESSING,
                gatewaySessionId: null,
                gatewayPageUrl: null,
                validationId: null,
                paidAt: null,
              },
            })
          : await tx.payment.create({
              data: {
                rentalRequestId: request.id,
                transactionId,
                provider: PaymentProvider.SSLCOMMERZ,
                amount: request.property.rent,
                currency: "BDT",
                status: PaymentStatus.PROCESSING,
              },
            });

        // The summary Payment row is reused for the same rental request, but
        // every gateway transaction gets its own immutable attempt row.
        const attempt = await tx.paymentAttempt.create({
          data: {
            paymentId: payment.id,
            transactionId,
            amount: request.property.rent,
            currency: "BDT",
            // PROCESSING claims session creation before the external request
            // starts. A concurrent create-payment request therefore cannot
            // create a second attempt while this request is in flight.
            status: PaymentStatus.PROCESSING,
          },
        });

        return {
          paymentId: payment.id,
          attemptId: attempt.id,
          rentalRequestId: request.id,
          transactionId,
          amount,
          currency: "BDT",
          status: PaymentStatus.PROCESSING,
          propertyTitle: request.property.title,
          customerName: request.tenant.name,
          customerEmail: request.tenant.email,
          gatewayPageUrl: null,
          phone: payload.phone,
          address: payload.address ?? "Dhaka",
          city: payload.city ?? "Dhaka",
          postcode: payload.postcode ?? "1000",
          existingSession: false,
          sessionRetry: false,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (preparedPayment.existingSession) {
      // No SSLCommerz call is needed here. The customer can use the existing
      // GatewayPageURL. Preserve PROCESSING if another request is currently
      // validating this transaction; status should describe the real state,
      // not merely the fact that a checkout URL exists.
      return {
        paymentId: preparedPayment.paymentId,
        rentalRequestId: preparedPayment.rentalRequestId,
        transactionId: preparedPayment.transactionId,
        amount: preparedPayment.amount,
        currency: preparedPayment.currency,
        status: preparedPayment.status,
        gatewayPageUrl: preparedPayment.gatewayPageUrl,
        // This tells the client that no new SSLCommerz attempt was created.
        // The same checkout URL and transaction ID can safely be reused.
        existingSession: true,
      };
    }

    let gatewaySessionWasCreated = false;

    try {
      // This is the only point where we create a new external checkout session.
      const session = await this.createGatewaySession({
        amount: preparedPayment.amount,
        transactionId: preparedPayment.transactionId,
        propertyTitle: preparedPayment.propertyTitle,
        customerName: preparedPayment.customerName,
        customerEmail: preparedPayment.customerEmail,
        phone: preparedPayment.phone,
        address: preparedPayment.address,
        city: preparedPayment.city,
        postcode: preparedPayment.postcode,
      });

      // From this point onward SSLCommerz may already have created a session.
      // If persisting the URL fails, the attempt must remain recoverable rather
      // than being marked as a definitive failure and replaced by a new one.
      gatewaySessionWasCreated = true;

      await prisma.payment.update({
        where: {
          id: preparedPayment.paymentId,
        },
        data: {
          gatewaySessionId: session.sessionkey,
          gatewayPageUrl: session.GatewayPageURL,
          status: PaymentStatus.PENDING,
        },
      });

      await prisma.paymentAttempt.update({
        where: {
          id: preparedPayment.attemptId,
        },
        data: {
          gatewaySessionId: session.sessionkey,
          gatewayPageUrl: session.GatewayPageURL,
          status: PaymentStatus.PENDING,
        },
      });

      return {
        paymentId: preparedPayment.paymentId,
        rentalRequestId: preparedPayment.rentalRequestId,
        transactionId: preparedPayment.transactionId,
        amount: preparedPayment.amount,
        currency: preparedPayment.currency,
        status: PaymentStatus.PENDING,
        gatewayPageUrl: session.GatewayPageURL,
        // A new PaymentAttempt and a new SSLCommerz session were created.
        existingSession: false,
      };
    } catch (error) {
      const requestIsUncertain =
        gatewaySessionWasCreated || error instanceof GatewayRequestUncertainError;

      if (requestIsUncertain) {
        // We did not receive a trustworthy gateway response. Keep this exact
        // attempt PROCESSING so a later request reuses its transaction ID. A
        // delayed IPN can also still validate and complete this attempt.
        await prisma.payment.updateMany({
          where: {
            id: preparedPayment.paymentId,
            transactionId: preparedPayment.transactionId,
            status: PaymentStatus.PROCESSING,
          },
          data: {
            status: PaymentStatus.PROCESSING,
          },
        });

        await prisma.paymentAttempt.updateMany({
          where: {
            id: preparedPayment.attemptId,
            transactionId: preparedPayment.transactionId,
            status: PaymentStatus.PROCESSING,
          },
          data: {
            status: PaymentStatus.PROCESSING,
            failureReason: "SESSION_CREATION_TIMEOUT_UNCERTAIN",
          },
        });
      } else {
        // SSLCommerz returned a definitive failure. This attempt is safe to
        // close, and a future request may create a new transaction.
        await prisma.payment.updateMany({
          where: {
            id: preparedPayment.paymentId,
            transactionId: preparedPayment.transactionId,
            status: PaymentStatus.PROCESSING,
          },
          data: {
            status: PaymentStatus.FAILED,
          },
        });

        await prisma.paymentAttempt.updateMany({
          where: {
            id: preparedPayment.attemptId,
            transactionId: preparedPayment.transactionId,
            status: PaymentStatus.PROCESSING,
          },
          data: {
            status: PaymentStatus.FAILED,
            failureReason: "SESSION_CREATION_FAILED",
          },
        });
      }

      throw error;
    }
  }

  async getAllPayments(actor: PaymentActor, page = 1, limit = 20) {
    // Payment history is filtered by the authenticated actor. Tenants see
    // their own payments, landlords see payments for their properties, and
    // admins see everything.
    const currentPage = Math.max(1, page);
    const pageSize = Math.min(Math.max(1, limit), 100);
    const skip = (currentPage - 1) * pageSize;

    const where: Prisma.PaymentWhereInput = {};

    if (actor.role === Role.TENANT) {
      where.rentalRequest = {
        is: {
          tenantId: actor.id,
        },
      };
    }

    if (actor.role === Role.LANDLORD) {
      where.rentalRequest = {
        is: {
          property: {
            is: {
              landlordId: actor.id,
            },
          },
        },
      };
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: paymentSelect,
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments,
      meta: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getPaymentById(id: string, actor: PaymentActor) {
    // The same visibility rule is applied to one payment lookup. A user must
    // not be able to guess another user's payment ID and read its details.
    if (!id) {
      throw new Error("Payment ID is required");
    }

    const visibilityFilter: Prisma.PaymentWhereInput =
      actor.role === Role.ADMIN
        ? {}
        : actor.role === Role.TENANT
          ? {
              rentalRequest: {
                is: {
                  tenantId: actor.id,
                },
              },
            }
          : {
              rentalRequest: {
                is: {
                  property: {
                    is: {
                      landlordId: actor.id,
                    },
                  },
                },
              },
            };

    const payment = await prisma.payment.findFirst({
      where: {
        id,
        ...visibilityFilter,
      },
      select: paymentSelect,
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    return payment;
  }

  private async completePayment(transactionId: string, validationId: string) {
    /*
     * FINAL SUCCESS FLOW
     *
     * This method is called only after confirmPayment() has validated the
     * transaction with SSLCommerz. It is deliberately a database transaction
     * because these changes must succeed together:
     *
     *   PaymentAttempt  -> COMPLETED
     *   Payment         -> COMPLETED
     *   RentalRequest   -> ACTIVE
     *   other open attempts -> CANCELLED
     *
     * If the process stops halfway through, the database must not show a
     * completed payment while the rental is still APPROVED.
     */
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findUnique({
        where: { transactionId },
        select: {
          id: true,
          paymentId: true,
          status: true,
          gatewaySessionId: true,
          gatewayPageUrl: true,
          payment: {
            select: {
              id: true,
              status: true,
              rentalRequestId: true,
            },
          },
        },
      });

      if (!attempt) {
        // The transaction ID may be forged, mistyped, or belong to another
        // application. Never create or complete a payment in this case.
        throw new Error("Payment attempt not found");
      }

      const payment = attempt.payment;

      if (attempt.status === PaymentStatus.COMPLETED) {
        // IPN and success callbacks can be delivered more than once. Returning
        // the current row makes the operation idempotent: the second callback
        // does not activate the rental a second time.
        return tx.payment.findUnique({
          where: { id: payment.id },
          select: paymentSelect,
        });
      }

      if (payment.status === PaymentStatus.REFUNDED) {
        throw new Error("Refunded payments cannot be completed");
      }

      // A second gateway attempt succeeded after another attempt had already
      // completed. Keep the attempt auditable, but do not activate anything twice.
      if (payment.status === PaymentStatus.COMPLETED) {
        /*
         * A second attempt succeeded after another attempt had already
         * completed. Both gateway transactions may have charged the customer.
         * Keep this second attempt in the database for audit/refund review, but
         * do not activate the rental again or create another rental record.
         */
        await tx.paymentAttempt.updateMany({
          where: { id: attempt.id },
          data: {
            status: PaymentStatus.COMPLETED,
            validationId,
            paidAt: new Date(),
            failureReason: "DUPLICATE_SUCCESS_REQUIRES_REFUND_REVIEW",
          },
        });

        return tx.payment.findUnique({
          where: { id: payment.id },
          select: paymentSelect,
        });
      }

      const request = await tx.rentalRequest.findUnique({
        where: { id: payment.rentalRequestId },
        select: { status: true },
      });

      if (
        request?.status !== RentalRequestStatus.APPROVED &&
        request?.status !== RentalRequestStatus.ACTIVE
      ) {
        // A successful gateway notification cannot activate a rental that the
        // landlord/admin has already rejected or that has otherwise expired.
        // Such a payment requires manual/refund handling.
        throw new Error("Rental request is no longer payable");
      }

      if (attempt.status === PaymentStatus.CANCELLED) {
        /*
         * CANCELLED is deliberately different from FAILED.
         *
         * A cancelled attempt means the customer or gateway explicitly ended
         * that checkout. A later valid callback must not silently reopen it,
         * because doing so could turn an intentional cancellation into a paid
         * rental. The transaction remains available in PaymentAttempt for
         * audit purposes, but the tenant must use a new checkout attempt.
         */
        throw new Error("Cancelled payment attempts cannot be completed");
      }

      if (attempt.status === PaymentStatus.REFUNDED) {
        throw new Error("Refunded payment attempts cannot be completed");
      }

      /*
       * A delayed valid IPN can complete an attempt that was locally marked
       * FAILED after a timeout. For example:
       *
       *   Attempt 1 -> our request times out -> locally FAILED
       *   Attempt 2 -> tenant starts a retry
       *   IPN for Attempt 1 -> SSLCommerz says VALID
       *
       * The gateway's successful validation is authoritative for a FAILED
       * attempt. We accept the valid payment and complete the rental once.
       * PaymentAttempt preserves the old transactionId so this delayed
       * notification can still be found. CANCELLED is intentionally excluded
       * above and can never be reopened by this path.
       */
      await tx.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          status: {
            in: [
              PaymentStatus.PENDING,
              PaymentStatus.PROCESSING,
              PaymentStatus.FAILED,
            ],
          },
        },
        data: {
          status: PaymentStatus.COMPLETED,
          validationId,
          paidAt: new Date(),
          failureReason: null,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          transactionId,
          status: PaymentStatus.COMPLETED,
          validationId,
          gatewaySessionId: attempt.gatewaySessionId,
          gatewayPageUrl: attempt.gatewayPageUrl,
          paidAt: new Date(),
        },
      });

      if (request.status === RentalRequestStatus.APPROVED) {
        // ACTIVE is the point at which payment has been verified and the rental
        // can begin. updateMany also protects against a concurrent activation.
        await tx.rentalRequest.updateMany({
          where: {
            id: payment.rentalRequestId,
            status: RentalRequestStatus.APPROVED,
          },
          data: { status: RentalRequestStatus.ACTIVE },
        });
      }

      await tx.paymentAttempt.updateMany({
        // Once one attempt succeeds, unfinished gateway sessions for this same
        // payment must not remain open. Their later failure callbacks will be
        // harmless because those attempts are already terminal.
        where: {
          paymentId: payment.id,
          id: { not: attempt.id },
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
          },
        },
        data: {
          status: PaymentStatus.CANCELLED,
          failureReason: "ANOTHER_ATTEMPT_COMPLETED",
        },
      });

      return tx.payment.findUnique({
        where: { id: payment.id },
        select: paymentSelect,
      });
    });
  }

  private async markAttemptFailed(transactionId: string, reason: string) {
    // This helper is used when SSLCommerz answers, but its answer fails one of
    // our safety checks: invalid status, mismatched amount/currency, wrong
    // transaction ID, or a risky transaction.
    //
    // We record the reason on the attempt so the payment history explains why
    // the checkout was rejected. The rental request itself remains APPROVED so
    // the tenant may try another attempt, unless the reservation later expires.
    await prisma.paymentAttempt.updateMany({
      where: {
        transactionId,
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
        },
      },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: reason,
      },
    });

    await prisma.payment.updateMany({
      where: {
        transactionId,
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
        },
      },
      data: {
        status: PaymentStatus.FAILED,
      },
    });
  }

  private async markAttemptProcessing(transactionId: string) {
    /*
     * PROCESSING means that we have received a possible success and are
     * currently asking SSLCommerz for the authoritative validation result.
     *
     * Why keep this state? PENDING means "checkout exists, but validation has
     * not started". PROCESSING tells operators and later callbacks that the
     * server is actively verifying this transaction. If validation fails, the
     * normal failure path changes it to FAILED. If validation succeeds,
     * completePayment() changes it to COMPLETED.
     *
     * A FAILED attempt is allowed to enter PROCESSING again because a delayed
     * IPN may arrive after our original validation request timed out. A
     * CANCELLED attempt is never included in this update and therefore cannot
     * be reopened accidentally.
     */
    return prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.updateMany({
        where: {
          transactionId,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.FAILED],
          },
        },
        data: {
          status: PaymentStatus.PROCESSING,
          failureReason: "PAYMENT_VALIDATION_IN_PROGRESS",
        },
      });

      // Payment is only a summary row. An old attempt may no longer be the
      // current transaction, so this update is intentionally guarded by
      // transactionId and cannot overwrite a newer retry's status.
      await tx.payment.updateMany({
        where: {
          transactionId,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.FAILED],
          },
        },
        data: {
          status: PaymentStatus.PROCESSING,
        },
      });

      return tx.paymentAttempt.findUnique({
        where: { transactionId },
        select: { status: true },
      });
    });
  }

  async expirePaymentReservations(now = new Date()) {
    /*
     * RESERVATION EXPIRY FLOW
     *
     * Approving a request reserves the property by setting
     * Property.available=false. That reservation cannot remain forever when
     * the tenant never pays, otherwise the property would be invisible to
     * everybody else indefinitely.
     *
     * The background job calls this method periodically. For every old
     * APPROVED request we atomically:
     *
     *   1. change RentalRequest APPROVED -> REJECTED;
     *   2. cancel any unfinished payment attempts;
     *   3. cancel the summary payment when it is still open; and
     *   4. make the property available again, unless another rental still
     *      legitimately owns that property.
     *
     * The APPROVED condition is repeated in updateMany. That is important:
     * an IPN may complete the payment at the same time the expiry worker is
     * running. Only whichever transaction changes APPROVED first is allowed to
     * decide the result.
     */
    const expiryMinutes = config.payment_reservation_expiry_minutes;

    if (!Number.isFinite(expiryMinutes) || expiryMinutes <= 0) {
      throw new Error(
        "PAYMENT_RESERVATION_EXPIRY_MINUTES must be a positive number",
      );
    }

    const cutoff = new Date(now.getTime() - expiryMinutes * 60 * 1000); // explanation: convert minutes to milliseconds

    return prisma.$transaction(
      async (tx) => {
        const candidates = await tx.rentalRequest.findMany({
          where: {
            status: RentalRequestStatus.APPROVED,
            approvedAt: {
              not: null,
              lt: cutoff,
            },
          },
          select: {
            id: true,
            propertyId: true,
            payment: {
              select: { id: true },
            },
          },
        });

        let expiredCount = 0;

        for (const candidate of candidates) {
          const expiredRequest = await tx.rentalRequest.updateMany({
            where: {
              id: candidate.id,
              status: RentalRequestStatus.APPROVED,
              approvedAt: {
                not: null,
                lt: cutoff,
              },
            },
            // Keep approvedAt as historical evidence of when the reservation
            // was created. The status is what prevents future payment attempts.
            data: {
              status: RentalRequestStatus.REJECTED,
            },
          });

          if (expiredRequest.count === 0) {
            // Another transaction completed or rejected this request while we
            // were processing the candidate list. Leave its property alone.
            continue;
          }

          expiredCount += 1;

          if (candidate.payment) {
            await tx.paymentAttempt.updateMany({
              where: {
                paymentId: candidate.payment.id,
                status: {
                  in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
                },
              },
              data: {
                status: PaymentStatus.CANCELLED,
                failureReason: "PAYMENT_RESERVATION_EXPIRED",
              },
            });

            await tx.payment.updateMany({
              where: {
                id: candidate.payment.id,
                status: {
                  in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
                },
              },
              data: {
                status: PaymentStatus.CANCELLED,
              },
            });
          }

          // Do not release a property if another approved or active request
          // already uses it. This guard makes the cleanup safe even if future
          // business rules allow more than one request per property.
          const anotherReservation = await tx.rentalRequest.findFirst({
            where: {
              propertyId: candidate.propertyId,
              id: { not: candidate.id },
              status: {
                in: [RentalRequestStatus.APPROVED, RentalRequestStatus.ACTIVE],
              },
            },
            select: { id: true },
          });

          if (!anotherReservation) {
            await tx.property.updateMany({
              where: {
                id: candidate.propertyId,
                available: false,
              },
              data: {
                available: true,
              },
            });
          }
        }

        return { expiredCount, cutoff };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async confirmPayment(payload: GatewayPayload) {
    /*
     * CONFIRMATION FLOW
     *
     * confirmPayment() is a verification gate, not the final business update.
     * It is triggered by:
     *
     *   - a VALID IPN from SSLCommerz;
     *   - the browser success callback;
     *   - the protected/manual confirm endpoint.
     *
     * The browser callback is not trusted by itself. We use val_id to ask
     * SSLCommerz directly, then compare the response with our PaymentAttempt.
     * Only after every check succeeds do we call completePayment().
     */
    const transactionId = this.readString(payload, "tran_id");
    const validationId = this.readString(payload, "val_id");

    if (!transactionId || !validationId) {
      // Without both values, the server cannot identify and verify a payment.
      throw new Error("tran_id and val_id are required");
    }

    const gatewayStatus = this.readString(payload, "status");

    if (
      gatewayStatus &&
      !["VALID", "VALIDATED"].includes(gatewayStatus.toUpperCase())
    ) {
      // FAILED/CANCELLED/EXPIRED notifications must use failPayment(), not the
      // success path.
      throw new Error("Gateway payment is not successful");
    }

    const attempt = await prisma.paymentAttempt.findUnique({
      where: {
        transactionId,
      },
      select: {
        amount: true,
        currency: true,
        status: true,
      },
    });

    if (!attempt) {
      // This can be a forged, malformed, or unknown transaction ID. It must not
      // create a new database record during confirmation.
      throw new Error("Payment attempt not found");
    }

    if (attempt.status === PaymentStatus.COMPLETED) {
      // Reconfirming an already completed attempt is safe and idempotent.
      return this.completePayment(transactionId, validationId);
    }

    if (attempt.status === PaymentStatus.CANCELLED) {
      // A cancellation is an explicit terminal decision for this gateway
      // session. Do not call SSLCommerz validation and do not reopen the
      // attempt if a late browser/IPN callback happens to contain a val_id.
      throw new Error("Cancelled payment attempts cannot be confirmed");
    }

    if (attempt.status === PaymentStatus.REFUNDED) {
      throw new Error("Refunded payment attempts cannot be confirmed");
    }

    const processingAttempt = await this.markAttemptProcessing(transactionId);

    if (!processingAttempt) {
      throw new Error("Payment attempt not found");
    }

    if (processingAttempt.status === PaymentStatus.CANCELLED) {
      // The reservation expiry worker or another callback may have cancelled
      // the attempt between the first read and this state transition.
      /**Attempt 1: PENDING → CANCELLED
       Later, a delayed VALID callback arrives for Attempt 1
        The tenant must create a new payment attempt.
        This protects against accidentally reopening a deliberately cancelled checkout.
 */
      throw new Error("Cancelled payment attempts cannot be confirmed");
    }

    const validation = await this.validateWithGateway(validationId);

    if (
      !validation.status ||
      !["VALID", "VALIDATED"].includes(validation.status.toUpperCase())
    ) {
      // SSLCommerz answered, but did not confirm the payment. Record the failed
      // verification and keep the rental request retryable.
      await this.markAttemptFailed(transactionId, "GATEWAY_VALIDATION_FAILED");
      throw new Error("SSLCommerz validation failed");
    }

    if (validation.tran_id !== transactionId) {
      // A valid val_id for a different transaction must never complete this
      // attempt.
      await this.markAttemptFailed(transactionId, "TRANSACTION_ID_MISMATCH");
      throw new Error("Gateway transaction ID does not match");
    }

    if (!this.amountsMatch(attempt.amount, validation.amount)) {
      // The amount is calculated from the property rent in our database. A
      // different gateway amount indicates tampering or a gateway mismatch.
      await this.markAttemptFailed(transactionId, "AMOUNT_MISMATCH");
      throw new Error("Gateway amount does not match payment amount");
    }

    const validationCurrency = validation.currency ?? validation.currency_type;

    if (validationCurrency !== attempt.currency) {
      // Currency mismatch is also a hard rejection; no rental activation occurs.
      await this.markAttemptFailed(transactionId, "CURRENCY_MISMATCH");
      throw new Error("Gateway currency does not match payment currency");
    }

    if (validation.risk_level === "1") {
      // A risky transaction is not automatically accepted. This implementation
      // records it as failed with a manual-review reason. A later risk-review
      // module could introduce a dedicated REVIEW status.
      await this.markAttemptFailed(transactionId, "RISK_REVIEW_REQUIRED");
      throw new Error("Risky payment requires manual verification");
    }

    return this.completePayment(transactionId, validationId);
  }

  private async failPayment(
    transactionId: string,
    status: PaymentFailureStatus,
  ) {
    /*
     * FAILURE FLOW
     *
     * This method handles a gateway attempt that did not complete:
     *
     *   FAILED    -> bank/gateway failure
     *   CANCELLED -> customer cancellation, expired session, or unattempted
     *                 checkout
     *
     * It changes only the matching PaymentAttempt. It changes the summary
     * Payment row only when this transaction is still the current attempt.
     * The approved rental request and property reservation are intentionally
     * kept unchanged so the tenant can retry.
     */
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findUnique({
        where: { transactionId },
        select: {
          id: true,
          paymentId: true,
          status: true,
        },
      });

      if (!attempt) {
        // An unknown transaction must not change any payment or rental record.
        throw new Error("Payment attempt not found");
      }

      if (
        attempt.status === PaymentStatus.COMPLETED ||
        attempt.status === PaymentStatus.REFUNDED
      ) {
        // A late failure notification must never downgrade a payment that was
        // already successfully completed or refunded.
        return tx.payment.findUnique({
          where: { id: attempt.paymentId },
          select: paymentSelect,
        });
      }

      if (
        attempt.status === PaymentStatus.FAILED ||
        attempt.status === PaymentStatus.CANCELLED
      ) {
        // Duplicate IPN/callback notifications are expected. Returning the
        // existing result makes failure handling idempotent.
        return tx.payment.findUnique({
          where: { id: attempt.paymentId },
          select: paymentSelect,
        });
      }

      await tx.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
          },
        },
        data: {
          status,
          failureReason:
            status === PaymentStatus.CANCELLED
              ? "CUSTOMER_OR_GATEWAY_CANCELLED"
              : "BANK_OR_GATEWAY_FAILED",
        },
      });

      /*
       * This updates the summary row only if this is still the current attempt.
       *
       * Example:
       *   Payment.transactionId = RN-NEW
       *   old callback arrives for RN-OLD
       *
       * RN-OLD is still marked failed in PaymentAttempt, but the summary row is
       * not changed because RN-OLD is no longer the current transaction. Older
       * attempts must not change the result of a newer retry.
       */
      await tx.payment.updateMany({
        where: {
          id: attempt.paymentId,
          transactionId,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
          },
        },
        data: { status },
      });

      // Keep RentalRequest APPROVED and Property unavailable. A separate expiry
      // process should eventually release the reservation if payment is never
      // completed; releasing it immediately would make the approval/retry flow
      // inconsistent.
      return tx.payment.findUnique({
        where: { id: attempt.paymentId },
        select: paymentSelect,
      });
    });
  }

  async handleIpn(payload: GatewayPayload) {
    //status,tran_id,val_id,amount,currency,currency_type,risk_level,verify_sign,verify_key,store_id,bank_tran_id
    /*
     * IPN FLOW
     *
     * IPN is a server-to-server notification and is the most important source
     * of payment state. The customer may close the browser before /success is
     * reached, but SSLCommerz can still call /ipn.
     *
     *   VALID/VALIDATED -> confirmPayment -> completePayment
     *   FAILED          -> failPayment(FAILED)
     *   CANCELLED/...   -> failPayment(CANCELLED)
     */
    if (!this.verifyGatewaySignature(payload)) {
      // Do not process a forged notification.
      throw new Error("Invalid SSLCommerz IPN signature");
    }

    const transactionId = this.readString(payload, "tran_id");
    const status = this.readString(payload, "status")?.toUpperCase();

    if (!transactionId || !status) {
      throw new Error("Invalid SSLCommerz IPN payload");
    }

    if (["VALID", "VALIDATED"].includes(status)) {
      // A successful status still requires server-side validation through val_id.
      return this.confirmPayment(payload);
    }

    if (status === "FAILED") {
      // Bank/gateway failure is terminal for this attempt, but retry remains
      // possible through a new PaymentAttempt.
      return this.failPayment(transactionId, PaymentStatus.FAILED);
    }

    if (["CANCELLED", "EXPIRED", "UNATTEMPTED"].includes(status)) {
      // SSLCommerz uses different labels for unsuccessful checkout endings. In
      // our domain they all mean the current attempt did not complete.
      return this.failPayment(transactionId, PaymentStatus.CANCELLED);
    }

    throw new Error("Unsupported SSLCommerz payment status");
  }

  async handleFailureCallback(
    payload: GatewayPayload,
    status: PaymentFailureStatus,
  ) {
    // /fail and /cancel are browser-facing gateway callbacks. They provide a
    // quick result for the checkout flow, but IPN remains the authoritative
    // server-to-server notification when it is available. Both paths call the
    // same idempotent failPayment() method.
    if (!this.verifyGatewaySignature(payload)) {
      throw new Error("Invalid SSLCommerz callback signature");
    }

    const transactionId = this.readString(payload, "tran_id");

    if (!transactionId) {
      throw new Error("tran_id is required");
    }

    return this.failPayment(transactionId, status);
  }
}
