import 'server-only';

import { generateQueryEmbedding } from './embeddings';
import { queryVectors } from './pinecone';
import { getDocumentChunksByPineconeIds } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export interface RetrievalContext {
  query: string;
  chunks: Array<{
    id: string;
    content: string;
    fileName: string;
    chunkIndex: number;
    similarity: number;
    tokenCount: number;
    metadata: any;
  }>;
  totalTokens: number;
  sources: Array<{
    fileName: string;
    chunks: number;
  }>;
}

export type RAGContext = RetrievalContext;

export interface RetrievalOptions {
  topK?: number;
  minScore?: number;
  maxTokens?: number;
  diversityThreshold?: number;
}

export async function retrieveRelevantContext({
  query,
  knowledgeBaseId,
  options = {},
}: {
  query: string;
  knowledgeBaseId: string;
  options?: RetrievalOptions;
}): Promise<RetrievalContext> {
  try {
    const {
      topK = 10,
      minScore = 0.7,
      maxTokens = 4000,
      diversityThreshold = 0.85,
    } = options;

    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding({ query });

    // Search Pinecone for similar chunks
    const vectorResults = await queryVectors({
      vector: queryEmbedding,
      knowledgeBaseId,
      topK: topK * 2, // Get more to allow for diversity filtering
      minScore,
    });

    if (!vectorResults.length) {
      return {
        query,
        chunks: [],
        totalTokens: 0,
        sources: [],
      };
    }

    // Apply diversity filtering to avoid too many similar chunks
    const diverseResults = applyDiversityFilter(vectorResults, diversityThreshold);

    // Get database chunk details
    const pineconeIds = diverseResults.map(result => result.id);
    const dbChunks = await getDocumentChunksByPineconeIds({ pineconeIds });

    // Combine vector results with database data
    const enrichedChunks = diverseResults
      .map(vectorResult => {
        const dbChunk = dbChunks.find(chunk => chunk.pineconeId === vectorResult.id);
        if (!dbChunk) return null;

        return {
          id: dbChunk.id,
          content: dbChunk.content,
          fileName: vectorResult.metadata.fileName,
          chunkIndex: dbChunk.chunkIndex,
          similarity: vectorResult.score,
          tokenCount: dbChunk.tokenCount,
          metadata: dbChunk.metadata,
        };
      })
      .filter(chunk => chunk !== null);

    // Apply token limit while preserving highest scoring chunks
    const filteredChunks = applyTokenLimit(enrichedChunks, maxTokens);

    // Generate source summary
    const sources = generateSourceSummary(filteredChunks);

    return {
      query,
      chunks: filteredChunks,
      totalTokens: filteredChunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
      sources,
    };

  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }

    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to retrieve context: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function buildRAGSystemPrompt({
  basePrompt,
  context,
  userQuery,
}: {
  basePrompt: string;
  context: RetrievalContext;
  userQuery: string;
}): string {
  if (!context.chunks.length) {
    return basePrompt;
  }

  const contextText = context.chunks
    .map((chunk, index) => {
      return `[Source ${index + 1}] From "${chunk.fileName}" (similarity: ${(chunk.similarity * 100).toFixed(1)}%):\n${chunk.content}`;
    })
    .join('\n\n');

  const sourcesList = context.sources
    .map(source => `- ${source.fileName} (${source.chunks} ${source.chunks === 1 ? 'chunk' : 'chunks'})`)
    .join('\n');

  return `${basePrompt}

You have access to relevant context from the user's knowledge base. Use this information to provide accurate, specific answers.

RELEVANT CONTEXT:
${contextText}

SOURCES USED:
${sourcesList}

INSTRUCTIONS:
- Use the provided context to answer questions accurately
- Cite sources by mentioning the document name when referencing specific information
- If the context doesn't contain relevant information for the user's question, clearly state this
- Combine information from multiple sources when appropriate
- Maintain the conversational tone while being informative

USER QUESTION: ${userQuery}`;
}

function applyDiversityFilter(
  results: Array<{ id: string; score: number; metadata: any }>,
  threshold: number
): Array<{ id: string; score: number; metadata: any }> {
  if (results.length <= 1) return results;

  const diverse: Array<{ id: string; score: number; metadata: any }> = [results[0]];
  
  for (let i = 1; i < results.length; i++) {
    const candidate = results[i];
    let isDiverse = true;

    for (const selected of diverse) {
      // Simple content similarity check (could be enhanced with embedding comparison)
      const contentSimilarity = calculateContentSimilarity(
        candidate.metadata.content,
        selected.metadata.content
      );
      
      if (contentSimilarity > threshold) {
        isDiverse = false;
        break;
      }
    }

    if (isDiverse) {
      diverse.push(candidate);
    }
  }

  return diverse;
}

function calculateContentSimilarity(content1: string, content2: string): number {
  // Simple Jaccard similarity for content diversity
  const words1 = new Set(content1.toLowerCase().split(/\s+/));
  const words2 = new Set(content2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

function applyTokenLimit<T extends { tokenCount: number; similarity: number }>(
  chunks: T[],
  maxTokens: number
): T[] {
  // Sort by similarity (highest first)
  const sortedChunks = [...chunks].sort((a, b) => b.similarity - a.similarity);
  
  const result: T[] = [];
  let totalTokens = 0;

  for (const chunk of sortedChunks) {
    if (totalTokens + chunk.tokenCount <= maxTokens) {
      result.push(chunk);
      totalTokens += chunk.tokenCount;
    }
  }

  return result;
}

function generateSourceSummary(
  chunks: Array<{ fileName: string }>
): Array<{ fileName: string; chunks: number }> {
  const sourceMap = new Map<string, number>();
  
  for (const chunk of chunks) {
    sourceMap.set(chunk.fileName, (sourceMap.get(chunk.fileName) || 0) + 1);
  }

  return Array.from(sourceMap.entries())
    .map(([fileName, chunks]) => ({ fileName, chunks }))
    .sort((a, b) => b.chunks - a.chunks);
}