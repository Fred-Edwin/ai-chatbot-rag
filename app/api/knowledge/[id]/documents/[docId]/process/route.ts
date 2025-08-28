import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import {
  getKnowledgeBaseById,
  getRAGDocumentById,
  updateRAGDocumentStatus,
} from '@/lib/db/queries';

export const maxDuration = 60;

export async function POST(
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

    // Only allow reprocessing of failed documents
    if (document.status !== 'failed') {
      return new ChatSDKError(
        'bad_request:rag',
        `Cannot reprocess document with status: ${document.status}`
      ).toResponse();
    }

    // Reset document to processing status
    const updatedDocument = await updateRAGDocumentStatus({
      id: docId,
      status: 'processing',
      errorMessage: undefined,
    });

    // Note: In a production environment, you would trigger the actual processing here
    // For now, we'll just update the status
    // TODO: Implement actual reprocessing logic

    return Response.json({
      data: updatedDocument,
      message: 'Document reprocessing started',
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