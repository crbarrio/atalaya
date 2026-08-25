-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'stack',
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
INSERT INTO "new_servers" ("cadvisorPort", "containersObservable", "createdAt", "enabled", "host", "id", "lastBackupAt", "lastBackupDetail", "lastBackupMode", "lastBackupStatus", "lastError", "lastSeenAt", "manifestAt", "name", "nodePort", "sshKeyPath", "sshPort", "sshUser", "stackPath", "tailnetIp", "updatedAt") SELECT "cadvisorPort", "containersObservable", "createdAt", "enabled", "host", "id", "lastBackupAt", "lastBackupDetail", "lastBackupMode", "lastBackupStatus", "lastError", "lastSeenAt", "manifestAt", "name", "nodePort", "sshKeyPath", "sshPort", "sshUser", "stackPath", "tailnetIp", "updatedAt" FROM "servers";
DROP TABLE "servers";
ALTER TABLE "new_servers" RENAME TO "servers";
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
