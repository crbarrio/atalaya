/*
  Warnings:

  - You are about to drop the column `status` on the `instances` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "app" TEXT,
    "client" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT,
    "deployedAt" DATETIME,
    "previousVersion" TEXT,
    "previousAt" DATETIME,
    "state" TEXT,
    "containers" TEXT,
    "databaseEngine" TEXT,
    "databaseName" TEXT,
    "domains" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instances_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_instances" ("app", "domains", "fetchedAt", "id", "name", "previousVersion", "serverId", "version") SELECT "app", "domains", "fetchedAt", "id", "name", "previousVersion", "serverId", "version" FROM "instances";
DROP TABLE "instances";
ALTER TABLE "new_instances" RENAME TO "instances";
CREATE UNIQUE INDEX "instances_serverId_name_key" ON "instances"("serverId", "name");
CREATE TABLE "new_servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "tailnetIp" TEXT NOT NULL,
    "sshUser" TEXT NOT NULL DEFAULT 'atalaya',
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshKeyPath" TEXT,
    "stackPath" TEXT NOT NULL DEFAULT '/home/ubuntu/docker/stack/stack',
    "nodePort" INTEGER NOT NULL DEFAULT 9100,
    "cadvisorPort" INTEGER NOT NULL DEFAULT 8080,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "lastError" TEXT,
    "manifestAt" DATETIME,
    "containersObservable" BOOLEAN NOT NULL DEFAULT false,
    "lastBackupStatus" TEXT,
    "lastBackupAt" TEXT,
    "lastBackupMode" TEXT,
    "lastBackupDetail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_servers" ("cadvisorPort", "createdAt", "enabled", "host", "id", "name", "nodePort", "sshPort", "sshUser", "tailnetIp", "updatedAt") SELECT "cadvisorPort", "createdAt", "enabled", "host", "id", "name", "nodePort", "sshPort", "sshUser", "tailnetIp", "updatedAt" FROM "servers";
DROP TABLE "servers";
ALTER TABLE "new_servers" RENAME TO "servers";
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
