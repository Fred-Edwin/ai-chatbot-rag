import 'server-only';

import OpenAI from 'openai';
import { ChatSDKError } from '@/lib/errors';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding({
  text,
}: {
  text: string;
}): Promise<number[]> {
  try {
    if (!text.trim()) {
      throw new ChatSDKError('bad_request:rag', 'Text cannot be empty');
    }

    if (text.length > 8000) {
      throw new ChatSDKError('bad_request:rag', 'Text too long for embedding');
    }

    const response = await openai.embeddings.create({
      input: text,
      model: 'text-embedding-ada-002',
    });

    const embedding = response.data[0]?.embedding;
    
    if (!embedding || embedding.length !== 1536) {
      throw new ChatSDKError('bad_request:rag', 'Invalid embedding response');
    }

    return embedding;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function generateEmbeddings({
  texts,
  batchSize = 100,
}: {
  texts: string[];
  batchSize?: number;
}): Promise<number[][]> {
  try {
    if (!texts.length) {
      return [];
    }

    const embeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map((text) => generateEmbedding({ text }))
      );
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function generateQueryEmbedding({
  query,
}: {
  query: string;
}): Promise<number[]> {
  try {
    return await generateEmbedding({ text: query });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    
    throw new ChatSDKError(
      'bad_request:rag',
      `Failed to generate query embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}