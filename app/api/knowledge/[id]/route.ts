import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import {
  getKnowledgeBaseById,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  getRAGDocumentsByKnowledgeBaseId,
} from '@/lib/db/queries';
import { deleteVectorsByKnowledgeBase } from '@/lib/rag/pinecone';
import { invalidateCache, CACHE_KEYS } from '@/lib/cache';
import { z } from 'zod';

export const maxDuration = 60;

const updateKnowledgeBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const { id } = await params;
    const knowledgeBase = await getKnowledgeBaseById({ id });
    
    if (!knowledgeBase) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    // Check ownership
    if (knowledgeBase.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    // Get documents count and status
    const documents = await getRAGDocumentsByKnowledgeBaseId({
      knowledgeBaseId: id,
    });

    const documentStats = {
      total: documents.length,
      ready: documents.filter(d => d.status === 'ready').length,
      processing: documents.filter(d => d.status === 'processing').length,
      failed: documents.filter(d => d.status === 'failed').length,
    };

    return Response.json({
      data: {
        ...knowledgeBase,
        documentStats,
        documents: documents.slice(0, 10), // Return first 10 documents
      },
    });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const { id } = await params;
    const json = await request.json();
    const body = updateKnowledgeBaseSchema.parse(json);

    // Verify ownership
    const existingKb = await getKnowledgeBaseById({ id });
    
    if (!existingKb) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    if (existingKb.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    const updatedKb = await updateKnowledgeBase({
      id,
      ...body,
    });

    // Invalidate caches
    await invalidateCache(`kb:user:${session.user.id}*`);
    await invalidateCache(CACHE_KEYS.knowledgeBase(id));

    return Response.json({
      data: updatedKb,
      message: 'Knowledge base updated successfully',
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const { id } = await params;
    
    // Verify ownership
    const knowledgeBase = await getKnowledgeBaseById({ id });
    
    if (!knowledgeBase) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    if (knowledgeBase.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    // Delete vectors from Pinecone first
    try {
      await deleteVectorsByKnowledgeBase({ knowledgeBaseId: id });
    } catch (vectorError) {
      console.error('Failed to delete vectors from Pinecone:', vectorError);
      // Log the error but continue with database deletion
      // Vector cleanup failure shouldn't prevent knowledge base deletion
    }

    // Delete from database (cascade will handle related records)
    await deleteKnowledgeBase({ id });

    // Invalidate caches
    await invalidateCache(`kb:user:${knowledgeBase.userId}*`);
    await invalidateCache(CACHE_KEYS.knowledgeBase(id));

    return Response.json({
      message: 'Knowledge base deleted successfully',
    });
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