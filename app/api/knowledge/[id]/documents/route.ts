import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import {
  getKnowledgeBaseById,
  getRAGDocumentsByKnowledgeBaseId,
} from '@/lib/db/queries';
import { uploadAndProcessDocument } from '@/lib/rag/pipeline';
import { invalidateCache, CACHE_KEYS } from '@/lib/cache';

export const maxDuration = 60;

const ALLOWED_MIME_TYPES = [
  // 'application/pdf', // Temporarily disabled due to dependency issues
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

    // Verify knowledge base exists and user owns it
    const knowledgeBase = await getKnowledgeBaseById({ id });
    
    if (!knowledgeBase) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    if (knowledgeBase.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'uploading' | 'processing' | 'ready' | 'failed' | null;

    const documents = await getRAGDocumentsByKnowledgeBaseId({
      knowledgeBaseId: id,
      status: status || undefined,
    });

    return Response.json({
      data: documents,
      meta: {
        knowledgeBaseId: id,
        knowledgeBaseName: knowledgeBase.name,
        total: documents.length,
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

    // Verify knowledge base exists and user owns it
    const knowledgeBase = await getKnowledgeBaseById({ id });
    
    if (!knowledgeBase) {
      return new ChatSDKError('not_found:rag', 'Knowledge base not found').toResponse();
    }

    if (knowledgeBase.userId !== session.user.id) {
      return new ChatSDKError('forbidden:rag', 'Access denied to knowledge base').toResponse();
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files.length) {
      return new ChatSDKError('bad_request:rag', 'No files provided').toResponse();
    }

    // Validate files
    const validationErrors: string[] = [];
    
    for (const [index, file] of files.entries()) {
      if (!file || !(file instanceof File)) {
        validationErrors.push(`File ${index + 1}: Invalid file`);
        continue;
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        validationErrors.push(
          `File ${index + 1} (${file.name}): Unsupported file type. Only TXT and DOCX files are currently supported.`
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        validationErrors.push(
          `File ${index + 1} (${file.name}): File too large. Maximum size is 10MB.`
        );
      }

      if (!file.name.trim()) {
        validationErrors.push(`File ${index + 1}: File name is required`);
      }
    }

    if (validationErrors.length > 0) {
      return new ChatSDKError(
        'bad_request:rag',
        `Validation errors: ${validationErrors.join(', ')}`
      ).toResponse();
    }

    // Check if user has reached document limit (optional)
    const existingDocs = await getRAGDocumentsByKnowledgeBaseId({
      knowledgeBaseId: id,
    });

    const maxDocsPerKb = 100; // Adjust based on your requirements
    if (existingDocs.length + files.length > maxDocsPerKb) {
      return new ChatSDKError(
        'bad_request:rag',
        `Document limit exceeded. Maximum ${maxDocsPerKb} documents per knowledge base.`
      ).toResponse();
    }

    // Process all files
    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const document = await uploadAndProcessDocument({
          knowledgeBaseId: id,
          file,
          userId: session.user.id,
        });
        
        results.push(document);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          fileName: file.name,
          error: errorMessage,
        });
      }
    }

    // Invalidate cache if any documents were successfully uploaded
    if (results.length > 0) {
      await invalidateCache(`kb:user:${session.user.id}*`);
      await invalidateCache(CACHE_KEYS.knowledgeBase(id));
      await invalidateCache(CACHE_KEYS.documents(id));
    }

    // Return results with any errors
    return Response.json({
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      message: `${results.length} document(s) uploaded successfully${
        errors.length > 0 ? `, ${errors.length} failed` : ''
      }`,
      meta: {
        successful: results.length,
        failed: errors.length,
        total: files.length,
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