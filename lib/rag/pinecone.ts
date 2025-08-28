import 'server-only';

import { Pinecone } from '@pinecone-database/pinecone';
import { ChatSDKError } from '@/lib/errors';
import { generateUUID } from '@/lib/utils';

const pinecone = new Pinecone({
  // biome-ignore lint/style/noNonNullAssertion: Environment variable is required for Pinecone
  apiKey: process.env.PINECONE_API_KEY!,
});

// biome-ignore lint/style/noNonNullAssertion: Environment variable is required for Pinecone
const indexName = process.env.PINECONE_INDEX_NAME!;

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: {
    documentId: string;
    knowledgeBaseId: string;
    chunkIndex: number;
    content: string;
    fileName: string;
    tokenCount: number;
    createdAt: string;
  };
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: VectorRecord['metadata'];
}

export async function getIndex() {
  try {
    return pinecone.index(indexName);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to get Pinecone index: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function upsertVectors({
  vectors,
}: {
  vectors: Array<{
    embedding: number[];
    documentId: string;
    knowledgeBaseId: string;
    chunkIndex: number;
    content: string;
    fileName: string;
    tokenCount: number;
  }>;
}): Promise<string[]> {
  try {
    if (!vectors.length) {
      return [];
    }

    const index = await getIndex();
    const records: VectorRecord[] = vectors.map((vector) => ({
      id: generateUUID(),
      values: vector.embedding,
      metadata: {
        documentId: vector.documentId,
        knowledgeBaseId: vector.knowledgeBaseId,
        chunkIndex: vector.chunkIndex,
        content: vector.content.substring(0, 40000), // Pinecone metadata limit
        fileName: vector.fileName,
        tokenCount: vector.tokenCount,
        createdAt: new Date().toISOString(),
      },
    }));

    await index.upsert(records);

    return records.map(record => record.id);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to upsert vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function queryVectors({
  vector,
  knowledgeBaseId,
  topK = 10,
  minScore = 0.7,
}: {
  vector: number[];
  knowledgeBaseId: string;
  topK?: number;
  minScore?: number;
}): Promise<SearchResult[]> {
  try {
    const index = await getIndex();
    
    const queryResponse = await index.query({
      vector,
      topK,
      filter: {
        knowledgeBaseId: { $eq: knowledgeBaseId },
      },
      includeValues: false,
      includeMetadata: true,
    });

    const results = queryResponse.matches
      ?.filter(match => match.score && match.score >= minScore)
      .map(match => ({
        id: match.id,
        // biome-ignore lint/style/noNonNullAssertion: Score is guaranteed to exist after filter
        score: match.score!,
        metadata: match.metadata as VectorRecord['metadata'],
      })) || [];

    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to query vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function deleteVectorsByDocument({
  documentId,
}: {
  documentId: string;
}): Promise<void> {
  try {
    const index = await getIndex();
    
    await index.deleteMany({
      filter: {
        documentId: { $eq: documentId },
      },
    });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function deleteVectorsByKnowledgeBase({
  knowledgeBaseId,
}: {
  knowledgeBaseId: string;
}): Promise<void> {
  try {
    const index = await getIndex();
    
    // First, query to get all vector IDs for this knowledge base
    const queryResponse = await index.query({
      vector: new Array(1536).fill(0), // Dummy vector for metadata-only search
      topK: 10000, // Large number to get all vectors
      filter: {
        knowledgeBaseId: { $eq: knowledgeBaseId },
      },
      includeValues: false,
      includeMetadata: false,
    });
    
    const vectorIds = queryResponse.matches?.map(match => match.id) || [];
    
    if (vectorIds.length > 0) {
      // Delete by IDs instead of using filter
      await index.deleteMany(vectorIds);
    }
  } catch (error) {
    console.error('Pinecone delete error:', error);
    // Don't throw error - log and continue with database cleanup
    console.log(`Continuing with database cleanup despite Pinecone error for KB: ${knowledgeBaseId}`);
  }
}

export async function getIndexStats(): Promise<{
  totalVectors: number;
  dimension: number;
}> {
  try {
    const index = await getIndex();
    const stats = await index.describeIndexStats();
    
    return {
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || 1536,
    };
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}