import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import { getKnowledgeBaseById } from '@/lib/db/queries';
import { retrieveRelevantContext } from '@/lib/rag/retrieval';
import { z } from 'zod';

export const maxDuration = 60;

const searchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000, 'Query too long'),
  topK: z.number().min(1).max(50).default(10),
  minScore: z.number().min(0).max(1).default(0.7),
  maxTokens: z.number().min(100).max(8000).default(4000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const { id } = await params;

    // Verify knowledge base ownership
    const knowledgeBase = await getKnowledgeBaseById({ id });
    
    if (!knowledgeBase) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    if (knowledgeBase.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    const json = await request.json();
    const body = searchSchema.parse(json);

    // Perform semantic search
    const context = await retrieveRelevantContext({
      query: body.query,
      knowledgeBaseId: id,
      options: {
        topK: body.topK,
        minScore: body.minScore,
        maxTokens: body.maxTokens,
      },
    });

    return Response.json({
      data: {
        query: context.query,
        chunks: context.chunks,
        sources: context.sources,
        totalTokens: context.totalTokens,
        meta: {
          knowledgeBaseId: id,
          knowledgeBaseName: knowledgeBase.name,
          searchParams: {
            topK: body.topK,
            minScore: body.minScore,
            maxTokens: body.maxTokens,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new ChatSDKError(
        'bad_request:rag',
        `Validation error: ${error.errors.map(e => e.message).join(', ')}`
      ).toResponse();
    }
    
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    
    console.error('API Error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}