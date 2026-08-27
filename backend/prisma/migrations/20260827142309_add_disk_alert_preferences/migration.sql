-- CreateTable
CREATE TABLE "disk_alert_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "mountpoint" TEXT NOT NULL,
    "trendAlerts" BOOLEAN NOT NULL DEFAULT true,
    "capacityAlerts" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "disk_alert_preferences_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "disk_alert_preferences_serverId_mountpoint_key" ON "disk_alert_preferences"("serverId", "mountpoint");
