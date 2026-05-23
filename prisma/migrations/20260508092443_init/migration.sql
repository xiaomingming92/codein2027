-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "content" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "filePath" DROP NOT NULL;
