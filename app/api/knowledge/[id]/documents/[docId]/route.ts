import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import {
  getKnowledgeBaseById,
  getRAGDocumentById,
  deleteRAGDocument,
  getDocumentChunksByDocumentId,
} from '@/lib/db/queries';
import { deleteVectorsByDocument } from '@/lib/rag/pinecone';

export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const { id, docId } = await params;

    // Verify knowledge base ownership
    const knowledgeBase = await getKnowledgeBaseById({ id });
    
    if (!knowledgeBase) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    if (knowledgeBase.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    // Get document details
    const document = await getRAGDocumentById({ id: docId });
    
    if (!document) {
      return new ChatSDKError('not_found:rag', 'Document not found').toResponse();
    }

    if (document.knowledgeBaseId !== id) {
      return new ChatSDKError('forbidden:rag', 'Document does not belong to this knowledge base').toResponse();
    }

    // Get chunks information
    const chunks = await getDocumentChunksByDocumentId({ 
      documentId: docId 
    });

    const chunkStats = {
      total: chunks.length,
      totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
      averageTokensPerChunk: chunks.length > 0 
        ? Math.round(chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0) / chunks.length)
        : 0,
    };

    return Response.json({
      data: {
        ...document,
        chunkStats,
        chunks: chunks.slice(0, 5).map(chunk => ({
          id: chunk.id,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          content: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
        })),
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:rag').toResponse();
    }

    const { id, docId } = await params;

    // Verify knowledge base ownership
    const knowledgeBase = await getKnowledgeBaseById({ id });
    
    if (!knowledgeBase) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    if (knowledgeBase.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    // Verify document exists and belongs to KB
    const document = await getRAGDocumentById({ id: docId });
    
    if (!document) {
      return new ChatSDKError('not_found:rag', 'Document not found').toResponse();
    }

    if (document.knowledgeBaseId !== id) {
      return new ChatSDKError('forbidden:rag', 'Document does not belong to this knowledge base').toResponse();
    }

    // Delete vectors from Pinecone first
    try {
      await deleteVectorsByDocument({ documentId: docId });
    } catch (vectorError) {
      console.error('Failed to delete vectors from Pinecone:', vectorError);
      // Continue with database deletion even if vector cleanup fails
    }

    // Delete from database (cascade will handle chunks)
    await deleteRAGDocument({ id: docId });

    return Response.json({
      message: 'Document deleted successfully',
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