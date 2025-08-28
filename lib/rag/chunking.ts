import 'server-only';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatSDKError } from '@/lib/errors';

export interface DocumentChunkData {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: {
    startIndex: number;
    endIndex: number;
    fileName?: string;
    page?: number;
    section?: string;
  };
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

const DEFAULT_SEPARATORS = [
  '\n\n',
  '\n',
  '.',
  '!',
  '?',
  ';',
  ':',
  ' ',
  '',
];

export async function splitIntoChunks({
  text,
  fileName,
  options = {},
}: {
  text: string;
  fileName?: string;
  options?: ChunkingOptions;
}): Promise<DocumentChunkData[]> {
  try {
    if (!text.trim()) {
      throw new ChatSDKError('bad_request:rag', 'Text cannot be empty');
    }

    const {
      chunkSize = 1000,
      chunkOverlap = 200,
      separators = DEFAULT_SEPARATORS,
    } = options;

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators,
    });

    const chunks = await splitter.splitText(text);

    const documentChunks: DocumentChunkData[] = [];
    let currentIndex = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const startIndex = currentIndex;
      const endIndex = startIndex + chunk.length;
      
      documentChunks.push({
        content: chunk.trim(),
        chunkIndex: i,
        tokenCount: estimateTokenCount(chunk),
        metadata: {
          startIndex,
          endIndex,
          fileName,
        },
      });

      currentIndex = endIndex - chunkOverlap;
    }

    return documentChunks;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }

    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to split text into chunks: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function splitPDFByPages({
  pages,
  fileName,
  options = {},
}: {
  pages: Array<{ content: string; pageNumber: number }>;
  fileName?: string;
  options?: ChunkingOptions;
}): Promise<DocumentChunkData[]> {
  try {
    const allChunks: DocumentChunkData[] = [];
    let globalChunkIndex = 0;

    for (const page of pages) {
      const chunks = await splitIntoChunks({
        text: page.content,
        fileName,
        options,
      });

      const pageChunks = chunks.map((chunk) => ({
        ...chunk,
        chunkIndex: globalChunkIndex++,
        metadata: {
          ...chunk.metadata,
          page: page.pageNumber,
        },
      }));

      allChunks.push(...pageChunks);
    }

    return allChunks;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }

    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to split PDF by pages: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function estimateTokenCount(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

export function validateChunkSize({
  chunks,
  maxTokens = 2000,
}: {
  chunks: DocumentChunkData[];
  maxTokens?: number;
}): { valid: boolean; oversizedChunks: DocumentChunkData[] } {
  const oversizedChunks = chunks.filter(chunk => chunk.tokenCount > maxTokens);
  
  return {
    valid: oversizedChunks.length === 0,
    oversizedChunks,
  };
}