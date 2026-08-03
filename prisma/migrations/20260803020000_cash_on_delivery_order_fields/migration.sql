-- Add explicit payment and fulfillment state for Cash on Delivery while
-- preserving all legacy Stripe identifiers and historical order data.
BEGIN;

CREATE TYPE "PaymentMethod" AS ENUM ('CASH_ON_DELIVERY', 'STRIPE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FULFILLED', 'CANCELLED');

ALTER TABLE "Order"
    ADD COLUMN "paymentMethod" "PaymentMethod",
    ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "orderStatus" "OrderStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "OrderItem"
    ADD COLUMN "unitPrice" DECIMAL(65,30);

-- Preserve legacy payment attribution without changing Stripe transaction IDs.
UPDATE "Order"
SET "paymentMethod" = 'STRIPE'
WHERE "stripeCustomerId" IS NOT NULL
   OR "stripeCheckoutSessionId" IS NOT NULL
   OR "stripePaymentIntentId" IS NOT NULL;

UPDATE "Order"
SET "paymentStatus" = 'PAID'
WHERE "isPaid" = true;

COMMIT;
