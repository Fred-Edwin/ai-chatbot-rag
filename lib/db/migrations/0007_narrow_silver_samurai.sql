CREATE TABLE IF NOT EXISTS "ChatKnowledgeBase" (
	"chatId" uuid NOT NULL,
	"knowledgeBaseId" uuid NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "ChatKnowledgeBase_chatId_knowledgeBaseId_pk" PRIMARY KEY("chatId","knowledgeBaseId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "DocumentChunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"content" text NOT NULL,
	"chunkIndex" integer NOT NULL,
	"tokenCount" integer NOT NULL,
	"pineconeId" varchar(100) NOT NULL,
	"metadata" json NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "DocumentChunk_pineconeId_unique" UNIQUE("pineconeId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "KnowledgeBase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"visibility" varchar DEFAULT 'private' NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RAGDocument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledgeBaseId" uuid NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"originalName" varchar(255) NOT NULL,
	"mimeType" varchar(100) NOT NULL,
	"fileSize" integer NOT NULL,
	"status" varchar DEFAULT 'uploading' NOT NULL,
	"errorMessage" text,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ChatKnowledgeBase" ADD CONSTRAINT "ChatKnowledgeBase_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ChatKnowledgeBase" ADD CONSTRAINT "ChatKnowledgeBase_knowledgeBaseId_KnowledgeBase_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."KnowledgeBase"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_RAGDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."RAGDocument"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RAGDocument" ADD CONSTRAINT "RAGDocument_knowledgeBaseId_KnowledgeBase_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."KnowledgeBase"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
