-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "tailnetIp" TEXT NOT NULL,
    "sshUser" TEXT NOT NULL DEFAULT 'ubuntu',
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "nodePort" INTEGER NOT NULL DEFAULT 9100,
    "cadvisorPort" INTEGER NOT NULL DEFAULT 8080,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "app" TEXT,
    "version" TEXT,
    "previousVersion" TEXT,
    "status" TEXT,
    "domains" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instances_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "alertName" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'firing',
    "summary" TEXT,
    "description" TEXT,
    "labels" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" DATETIME,
    CONSTRAINT "incidents_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL,
    "severities" TEXT NOT NULL DEFAULT 'critical,warning',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "provision_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'pending',
    "detail" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provision_checks_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" TEXT,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "instances_serverId_name_key" ON "instances"("serverId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_fingerprint_key" ON "incidents"("fingerprint");

-- CreateIndex
CREATE INDEX "incidents_status_startsAt_idx" ON "incidents"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_name_key" ON "notification_channels"("name");

-- CreateIndex
CREATE INDEX "provision_checks_serverId_checkedAt_idx" ON "provision_checks"("serverId", "checkedAt");

-- CreateIndex
CREATE INDEX "audit_entries_createdAt_idx" ON "audit_entries"("createdAt");
