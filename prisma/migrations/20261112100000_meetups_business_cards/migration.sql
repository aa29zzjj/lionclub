-- CreateTable
CREATE TABLE "Meetup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupRegistration" (
    "meetupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "MeetupRegistration_pkey" PRIMARY KEY ("meetupId","memberId")
);

-- CreateTable
CREATE TABLE "MeetupMessage" (
    "id" TEXT NOT NULL,
    "meetupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetupMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCard" (
    "memberId" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "tags" TEXT[],
    "shareTags" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCard_pkey" PRIMARY KEY ("memberId")
);

-- CreateIndex
CREATE INDEX "Meetup_organizationId_startsAt_id_idx" ON "Meetup"("organizationId", "startsAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Meetup_hostId_requestId_key" ON "Meetup"("hostId", "requestId");

-- CreateIndex
CREATE INDEX "MeetupRegistration_memberId_idx" ON "MeetupRegistration"("memberId");

-- CreateIndex
CREATE INDEX "MeetupMessage_meetupId_createdAt_id_idx" ON "MeetupMessage"("meetupId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupMessage_memberId_requestId_key" ON "MeetupMessage"("memberId", "requestId");

-- CreateIndex
CREATE INDEX "BusinessCard_tags_idx" ON "BusinessCard" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "Meetup" ADD CONSTRAINT "Meetup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meetup" ADD CONSTRAINT "Meetup_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupRegistration" ADD CONSTRAINT "MeetupRegistration_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupRegistration" ADD CONSTRAINT "MeetupRegistration_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupMessage" ADD CONSTRAINT "MeetupMessage_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupMessage" ADD CONSTRAINT "MeetupMessage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCard" ADD CONSTRAINT "BusinessCard_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
