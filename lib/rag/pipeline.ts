import 'server-only';

import { put } from '@vercel/blob';
import mammoth from 'mammoth';
import { splitIntoChunks, } from './chunking';
import { generateEmbeddings } from './embeddings';
import { upsertVectors } from './pinecone';
import { ChatSDKError } from '@/lib/errors';
import { 
  saveRAGDocument, 
  updateRAGDocumentStatus, 
  saveDocumentChunks,
  getRAGDocumentById,
  type RAGDocument 
} from '@/lib/db/queries';

export interface ProcessingResult {
  document: RAGDocument;
  chunks: Array<{
    id: string;
    pineconeId: string;
    content: string;
    chunkIndex: number;
  }>;
}

export async function uploadAndProcessDocument({
  knowledgeBaseId,
  file,
  userId,
}: {
  knowledgeBaseId: string;
  file: File;
  userId: string;
}): Promise<RAGDocument> {
  try {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new ChatSDKError(
        'bad_request:rag',
        'Unsupported file type. Only PDF, TXT, and DOCX files are supported.'
      );
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new ChatSDKError(
        'bad_request:rag',
        'File too large. Maximum size is 10MB.'
      );
    }

    // Upload to Vercel Blob
    const { url, pathname } = await put(file.name, file, {
      access: 'public',
    });

    // Create document record
    const document = await saveRAGDocument({
      knowledgeBaseId,
      fileName: pathname,
      originalName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      status: 'processing',
    });

    // Process document asynchronously
    processDocumentAsync(document.id, url, file.type, file.name)
      .catch(async (error) => {
        await updateRAGDocumentStatus({
          id: document.id,
          status: 'failed',
          errorMessage: error.message,
        });
      });

    return document;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }

    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function processDocumentAsync(
  documentId: string,
  fileUrl: string,
  mimeType: string,
  fileName: string
): Promise<void> {
  try {
    // Download file content
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('Failed to download file from blob storage');
    }

    const buffer = await response.arrayBuffer();
    
    // Extract text content
    const textContent = await extractTextContent(buffer, mimeType);
    
    // Split into chunks
    const chunks = await splitIntoChunks({
      text: textContent,
      fileName,
      options: {
        chunkSize: 1000,
        chunkOverlap: 200,
      },
    });

    if (!chunks.length) {
      throw new Error('No content could be extracted from the document');
    }

    // Generate embeddings
    const embeddings = await generateEmbeddings({
      texts: chunks.map(chunk => chunk.content),
    });

    // Get document details for vector storage
    const document = await getRAGDocumentById({ id: documentId });
    
    if (!document) {
      throw new ChatSDKError('not_found:rag', 'Document not found during processing');
    }
    
    // Store vectors in Pinecone
    const pineconeIds = await upsertVectors({
      vectors: chunks.map((chunk, index) => ({
        embedding: embeddings[index],
        documentId: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        fileName: document.originalName,
        tokenCount: chunk.tokenCount,
      })),
    });

    // Save chunk records to database
    await saveDocumentChunks({
      chunks: chunks.map((chunk, index) => ({
        documentId: document.id,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        pineconeId: pineconeIds[index],
        metadata: chunk.metadata,
      })),
    });

    // Mark document as ready
    await updateRAGDocumentStatus({
      id: documentId,
      status: 'ready',
    });

  } catch (error) {
    await updateRAGDocumentStatus({
      id: documentId,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown processing error',
    });
    throw error;
  }
}

async function extractTextContent(
  buffer: ArrayBuffer,
  mimeType: string
): Promise<string> {
  try {
    switch (mimeType) {
      case 'application/pdf':
        throw new ChatSDKError('bad_request:rag', 'PDF processing temporarily disabled. Please use TXT or DOCX files.');
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractDocxText(buffer);
      
      case 'text/plain':
        return new TextDecoder().decode(buffer);
      
      default:
        throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to extract text content: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// PDF extraction temporarily disabled due to dependency issues
// async function extractPDFText(buffer: ArrayBuffer): Promise<string> {
//   // Implementation removed - PDF support will be re-added with a different library
// }

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(buffer),
    });
    
    if (!result.value?.trim()) {
      throw new Error('DOCX contains no extractable text');
    }
    
    return result.value;
  } catch (error) {
    throw new Error(`DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

