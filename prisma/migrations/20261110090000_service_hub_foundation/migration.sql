-- CreateTable
CREATE TABLE "EventOutcome" (
    "eventId" TEXT NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "beneficiaryCount" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "quantityUnit" TEXT NOT NULL,
    "totalServiceMinutes" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOutcome_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "ResourceNeed" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NEED',
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetDate" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityUnit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "acceptedResponseId" TEXT,
    "completionNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceNeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceResponse" (
    "id" TEXT NOT NULL,
    "needId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "requestId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceNeed_acceptedResponseId_key" ON "ResourceNeed"("acceptedResponseId");

-- CreateIndex
CREATE INDEX "ResourceNeed_status_createdAt_id_idx" ON "ResourceNeed"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ResourceNeed_organizationId_idx" ON "ResourceNeed"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceNeed_ownerId_requestId_key" ON "ResourceNeed"("ownerId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceResponse_needId_memberId_key" ON "ResourceResponse"("needId", "memberId");

-- CreateIndex
CREATE INDEX "ServiceEntry_memberId_date_id_idx" ON "ServiceEntry"("memberId", "date", "id");

-- CreateIndex
CREATE INDEX "ServiceEntry_organizationId_status_date_idx" ON "ServiceEntry"("organizationId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceEntry_memberId_requestId_key" ON "ServiceEntry"("memberId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceEntry_memberId_dedupKey_key" ON "ServiceEntry"("memberId", "dedupKey");

-- CreateIndex
CREATE INDEX "ServiceAudit_entityType_entityId_createdAt_idx" ON "ServiceAudit"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "EventOutcome" ADD CONSTRAINT "EventOutcome_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOutcome" ADD CONSTRAINT "EventOutcome_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceNeed" ADD CONSTRAINT "ResourceNeed_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceNeed" ADD CONSTRAINT "ResourceNeed_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceNeed" ADD CONSTRAINT "ResourceNeed_acceptedResponseId_fkey" FOREIGN KEY ("acceptedResponseId") REFERENCES "ResourceResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceResponse" ADD CONSTRAINT "ResourceResponse_needId_fkey" FOREIGN KEY ("needId") REFERENCES "ResourceNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceResponse" ADD CONSTRAINT "ResourceResponse_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEntry" ADD CONSTRAINT "ServiceEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEntry" ADD CONSTRAINT "ServiceEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEntry" ADD CONSTRAINT "ServiceEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEntry" ADD CONSTRAINT "ServiceEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAudit" ADD CONSTRAINT "ServiceAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain integrity remains enforced even when multiple clients act concurrently.
ALTER TABLE "EventOutcome" ADD CONSTRAINT "EventOutcome_values_check" CHECK ("quantity" BETWEEN 0 AND 1000000 AND "totalServiceMinutes" BETWEEN 0 AND 100000000 AND ("beneficiaryCount" IS NULL OR "beneficiaryCount" BETWEEN 0 AND 1000000) AND "version" > 0);
ALTER TABLE "ResourceNeed" ADD CONSTRAINT "ResourceNeed_values_check" CHECK ("kind" IN ('NEED','OFFER') AND "status" IN ('OPEN','RESPONDED','MATCHED','COMPLETED','CLOSED') AND "quantity" BETWEEN 1 AND 10000 AND "version" > 0 AND ("status" NOT IN ('MATCHED','COMPLETED') OR "acceptedResponseId" IS NOT NULL) AND ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL));
ALTER TABLE "ResourceResponse" ADD CONSTRAINT "ResourceResponse_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','NOT_SELECTED'));
CREATE UNIQUE INDEX "ResourceResponse_one_accepted_per_need" ON "ResourceResponse"("needId") WHERE "status" = 'ACCEPTED';
ALTER TABLE "ServiceEntry" ADD CONSTRAINT "ServiceEntry_values_check" CHECK ("minutes" BETWEEN 15 AND 960 AND "version" > 0 AND "status" IN ('PENDING','CONFIRMED','REJECTED','REVOKED') AND ("status" = 'PENDING' OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewedById" <> "memberId")));
