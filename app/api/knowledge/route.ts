import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import {
  createKnowledgeBase,
  getKnowledgeBasesByUserId,
  getKnowledgeBasesWithStatsById,
  type KnowledgeBaseWithStats,
} from '@/lib/db/queries';
import { getCached, invalidateCache, CACHE_KEYS } from '@/lib/cache';
import { z } from 'zod';

export const maxDuration = 60;

const createKnowledgeBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  visibility: z.enum(['public', 'private']).default('private'),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const includeStats = searchParams.get('include') === 'stats';

    if (includeStats) {
      // Use cached optimized query with stats
      const knowledgeBasesWithStats = await getCached<KnowledgeBaseWithStats[]>(
        CACHE_KEYS.knowledgeBases(session.user.id),
        () => getKnowledgeBasesWithStatsById({
          userId: session.user.id,
          limit,
        }),
        { ttl: 300 } // 5 minutes cache
      );

      return Response.json({
        data: knowledgeBasesWithStats,
        meta: {
          total: knowledgeBasesWithStats.length,
          limit,
          cached: true,
        },
      });
    } else {
      // Legacy endpoint for backward compatibility
      const knowledgeBases = await getKnowledgeBasesByUserId({
        userId: session.user.id,
        limit,
      });

      return Response.json({
        data: knowledgeBases,
        meta: {
          total: knowledgeBases.length,
          limit,
        },
      });
    }
  } catch (error) {
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

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const json = await request.json();
    const body = createKnowledgeBaseSchema.parse(json);

    const knowledgeBase = await createKnowledgeBase({
      name: body.name,
      description: body.description,
      userId: session.user.id,
      visibility: body.visibility,
    });

    // Invalidate cache for this user's knowledge bases
    await invalidateCache(`kb:user:${session.user.id}*`);

    return Response.json({
      data: knowledgeBase,
      message: 'Knowledge base created successfully',
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