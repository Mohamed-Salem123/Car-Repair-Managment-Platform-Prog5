-- Admin recipients registry: admins registered here receive system
-- notifications (the notification service cannot query identity_db directly).
CREATE TABLE "admin_recipients" (
    "userId" TEXT NOT NULL,
    CONSTRAINT "admin_recipients_pkey" PRIMARY KEY ("userId")
);
