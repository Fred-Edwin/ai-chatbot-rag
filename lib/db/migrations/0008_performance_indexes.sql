-- Performance optimization indexes for production
-- These indexes will improve query performance significantly

-- Knowledge Base indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id 
ON "KnowledgeBase" ("userId");

CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_updated 
ON "KnowledgeBase" ("userId", "updatedAt" DESC);

-- RAG Document indexes  
CREATE INDEX IF NOT EXISTS idx_rag_document_kb_status 
ON "RAGDocument" ("knowledgeBaseId", "status");

CREATE INDEX IF NOT EXISTS idx_rag_document_kb_created 
ON "RAGDocument" ("knowledgeBaseId", "createdAt" DESC);

-- Document Chunk indexes
CREATE INDEX IF NOT EXISTS idx_document_chunk_document_id 
ON "DocumentChunk" ("documentId");

CREATE INDEX IF NOT EXISTS idx_document_chunk_pinecone_id 
ON "DocumentChunk" ("pineconeId");

-- Chat indexes
CREATE INDEX IF NOT EXISTS idx_chat_user_created 
ON "Chat" ("userId", "createdAt" DESC);

-- Message indexes  
CREATE INDEX IF NOT EXISTS idx_message_chat_created 
ON "Message_v2" ("chatId", "createdAt");

-- Chat Knowledge Base junction table
CREATE INDEX IF NOT EXISTS idx_chat_kb_chat_id 
ON "ChatKnowledgeBase" ("chatId");

CREATE INDEX IF NOT EXISTS idx_chat_kb_kb_id 
ON "ChatKnowledgeBase" ("knowledgeBaseId");