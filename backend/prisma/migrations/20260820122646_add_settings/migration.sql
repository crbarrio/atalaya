-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "healthchecksUrl" TEXT,
    "updatedAt" DATETIME NOT NULL
);
