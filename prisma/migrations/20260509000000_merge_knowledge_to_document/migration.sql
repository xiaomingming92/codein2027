-- Migration: Merge KnowledgeDocument into Document with sourceType

-- Step 1: Create SourceType enum
CREATE TYPE "SourceType" AS ENUM ('PROJECT_DOC', 'KNOWLEDGE_UPDATE');

-- Step 2: Add new columns to Document table
ALTER TABLE "Document" ADD COLUMN "sourceType" "SourceType" NOT NULL DEFAULT 'PROJECT_DOC';
ALTER TABLE "Document" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Document" ALTER COLUMN "projectId" DROP NOT NULL;

-- Step 3: Migrate KnowledgeDocument data into Document
-- Note: KnowledgeDocument.status values ('processing', 'ready', 'error') need mapping
-- We map: 'ready' -> 'INDEXED', others -> 'PENDING'
INSERT INTO "Document" (
    "id",
    "sourceType",
    "name",
    "type",
    "filePath",
    "status",
    "version",
    "metadata",
    "createdBy",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    'KNOWLEDGE_UPDATE'::"SourceType",
    "name",
    "type",
    "path",
    CASE
        WHEN "status" = 'ready' THEN 'INDEXED'::"DocStatus"
        ELSE 'PENDING'::"DocStatus"
    END,
    1,
    jsonb_build_object(
        'originalSize', "size",
        'originalStatus', "status",
        'vectorCount', "vectorCount",
        'migratedFrom', 'KnowledgeDocument'
    ),
    'system',
    "createdAt",
    "updatedAt"
FROM "KnowledgeDocument";

-- Step 4: Drop KnowledgeDocument table
DROP TABLE "KnowledgeDocument";

-- Step 5: Add composite unique index on Document
CREATE UNIQUE INDEX "Document_name_version_sourceType_key" ON "Document"("name", "version", "sourceType");
