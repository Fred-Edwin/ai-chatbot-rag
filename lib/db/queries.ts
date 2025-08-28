import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  type Chat,
  stream,
  knowledgeBase,
  ragDocument,
  documentChunk,
  chatKnowledgeBase,
  type KnowledgeBase,
  type RAGDocument,
  type DocumentChunk,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '../utils';
import { generateHashedPassword } from './utils';
import type { VisibilityType } from '@/components/visibility-selector';
import { ChatSDKError } from '../errors';

export type { KnowledgeBase, RAGDocument, DocumentChunk } from './schema';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get user by email',
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create user');
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create guest user',
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('getChatsByUserId error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      `Failed to get chats by user id: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to vote message');
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get votes by chat id',
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save document');
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get documents by id',
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document by id',
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete documents by id after timestamp',
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to save suggestions',
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get suggestions by document id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message count by user id',
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create stream id',
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get stream ids by chat id',
    );
  }
}

// RAG Query Functions

export async function createKnowledgeBase({
  name,
  description,
  userId,
  visibility = 'private',
}: {
  name: string;
  description?: string;
  userId: string;
  visibility?: 'public' | 'private';
}): Promise<KnowledgeBase> {
  try {
    const [kb] = await db
      .insert(knowledgeBase)
      .values({
        name,
        description,
        userId,
        visibility,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return kb;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create knowledge base',
    );
  }
}

export async function getKnowledgeBasesByUserId({
  userId,
  limit = 50,
}: {
  userId: string;
  limit?: number;
}): Promise<KnowledgeBase[]> {
  try {
    return await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.userId, userId))
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(limit);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get knowledge bases by user id',
    );
  }
}

export async function getKnowledgeBaseById({
  id,
}: {
  id: string;
}): Promise<KnowledgeBase | null> {
  try {
    const [kb] = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.id, id))
      .limit(1);

    return kb || null;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get knowledge base by id',
    );
  }
}

export async function updateKnowledgeBase({
  id,
  name,
  description,
  visibility,
}: {
  id: string;
  name?: string;
  description?: string;
  visibility?: 'public' | 'private';
}): Promise<KnowledgeBase> {
  try {
    const updateData: Partial<typeof knowledgeBase.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (visibility !== undefined) updateData.visibility = visibility;

    const [updatedKb] = await db
      .update(knowledgeBase)
      .set(updateData)
      .where(eq(knowledgeBase.id, id))
      .returning();

    return updatedKb;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update knowledge base',
    );
  }
}

export async function deleteKnowledgeBase({ id }: { id: string }): Promise<void> {
  try {
    // Delete in order due to foreign key constraints
    await db.delete(chatKnowledgeBase).where(eq(chatKnowledgeBase.knowledgeBaseId, id));
    await db.delete(documentChunk).where(
      eq(documentChunk.documentId, 
        db.select({ id: ragDocument.id })
          .from(ragDocument)
          .where(eq(ragDocument.knowledgeBaseId, id))
      )
    );
    await db.delete(ragDocument).where(eq(ragDocument.knowledgeBaseId, id));
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete knowledge base',
    );
  }
}

export async function saveRAGDocument({
  knowledgeBaseId,
  fileName,
  originalName,
  mimeType,
  fileSize,
  status = 'uploading',
}: {
  knowledgeBaseId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status?: 'uploading' | 'processing' | 'ready' | 'failed';
}): Promise<RAGDocument> {
  try {
    const [doc] = await db
      .insert(ragDocument)
      .values({
        knowledgeBaseId,
        fileName,
        originalName,
        mimeType,
        fileSize,
        status,
        createdAt: new Date(),
      })
      .returning();

    return doc;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to save RAG document',
    );
  }
}

export async function getRAGDocumentById({
  id,
}: {
  id: string;
}): Promise<RAGDocument | null> {
  try {
    const [doc] = await db
      .select()
      .from(ragDocument)
      .where(eq(ragDocument.id, id))
      .limit(1);

    return doc || null;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get RAG document by id',
    );
  }
}

export async function getRAGDocumentsByKnowledgeBaseId({
  knowledgeBaseId,
  status,
}: {
  knowledgeBaseId: string;
  status?: 'uploading' | 'processing' | 'ready' | 'failed';
}): Promise<RAGDocument[]> {
  try {
    const whereConditions = [eq(ragDocument.knowledgeBaseId, knowledgeBaseId)];
    
    if (status) {
      whereConditions.push(eq(ragDocument.status, status));
    }

    return await db
      .select()
      .from(ragDocument)
      .where(and(...whereConditions))
      .orderBy(desc(ragDocument.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get RAG documents by knowledge base id',
    );
  }
}

export async function updateRAGDocumentStatus({
  id,
  status,
  errorMessage,
}: {
  id: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  errorMessage?: string;
}): Promise<RAGDocument> {
  try {
    const [updatedDoc] = await db
      .update(ragDocument)
      .set({ status, errorMessage })
      .where(eq(ragDocument.id, id))
      .returning();

    return updatedDoc;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update RAG document status',
    );
  }
}

export async function deleteRAGDocument({ id }: { id: string }): Promise<void> {
  try {
    await db.delete(documentChunk).where(eq(documentChunk.documentId, id));
    await db.delete(ragDocument).where(eq(ragDocument.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete RAG document',
    );
  }
}

export async function saveDocumentChunks({
  chunks,
}: {
  chunks: Array<{
    documentId: string;
    content: string;
    chunkIndex: number;
    tokenCount: number;
    pineconeId: string;
    metadata: any;
  }>;
}): Promise<DocumentChunk[]> {
  try {
    if (!chunks.length) return [];

    return await db
      .insert(documentChunk)
      .values(
        chunks.map(chunk => ({
          ...chunk,
          createdAt: new Date(),
        }))
      )
      .returning();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to save document chunks',
    );
  }
}

export async function getDocumentChunksByPineconeIds({
  pineconeIds,
}: {
  pineconeIds: string[];
}): Promise<DocumentChunk[]> {
  try {
    if (!pineconeIds.length) return [];

    return await db
      .select()
      .from(documentChunk)
      .where(inArray(documentChunk.pineconeId, pineconeIds))
      .orderBy(asc(documentChunk.chunkIndex));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document chunks by pinecone ids',
    );
  }
}

export async function getDocumentChunksByDocumentId({
  documentId,
}: {
  documentId: string;
}): Promise<DocumentChunk[]> {
  try {
    return await db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.documentId, documentId))
      .orderBy(asc(documentChunk.chunkIndex));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document chunks by document id',
    );
  }
}

export async function linkChatToKnowledgeBase({
  chatId,
  knowledgeBaseId,
}: {
  chatId: string;
  knowledgeBaseId: string;
}): Promise<void> {
  try {
    await db
      .insert(chatKnowledgeBase)
      .values({
        chatId,
        knowledgeBaseId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to link chat to knowledge base',
    );
  }
}

export async function getChatKnowledgeBases({
  chatId,
}: {
  chatId: string;
}): Promise<KnowledgeBase[]> {
  try {
    const results = await db
      .select({
        knowledgeBase: knowledgeBase,
      })
      .from(chatKnowledgeBase)
      .innerJoin(knowledgeBase, eq(chatKnowledgeBase.knowledgeBaseId, knowledgeBase.id))
      .where(eq(chatKnowledgeBase.chatId, chatId));

    return results.map(result => result.knowledgeBase);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chat knowledge bases',
    );
  }
}

// Optimized version with document stats in single query
export interface KnowledgeBaseWithStats extends KnowledgeBase {
  documentStats: {
    total: number;
    ready: number;
    processing: number;
    failed: number;
  };
  documents: RAGDocument[];
}

export async function getKnowledgeBasesWithStatsById({
  userId,
  limit = 50,
}: {
  userId: string;
  limit?: number;
}): Promise<KnowledgeBaseWithStats[]> {
  try {
    // Get knowledge bases with aggregated document stats
    const kbWithStats = await db
      .select({
        id: knowledgeBase.id,
        name: knowledgeBase.name,
        description: knowledgeBase.description,
        userId: knowledgeBase.userId,
        visibility: knowledgeBase.visibility,
        createdAt: knowledgeBase.createdAt,
        updatedAt: knowledgeBase.updatedAt,
        totalDocs: sql<number>`count(${ragDocument.id})::int`,
        readyDocs: sql<number>`count(case when ${ragDocument.status} = 'ready' then 1 end)::int`,
        processingDocs: sql<number>`count(case when ${ragDocument.status} = 'processing' then 1 end)::int`,
        failedDocs: sql<number>`count(case when ${ragDocument.status} = 'failed' then 1 end)::int`,
      })
      .from(knowledgeBase)
      .leftJoin(ragDocument, eq(knowledgeBase.id, ragDocument.knowledgeBaseId))
      .where(eq(knowledgeBase.userId, userId))
      .groupBy(knowledgeBase.id)
      .limit(limit)
      .orderBy(desc(knowledgeBase.updatedAt));

    // Get recent documents for each knowledge base in a single query
    const allKbIds = kbWithStats.map(kb => kb.id);
    const recentDocuments = await db
      .select()
      .from(ragDocument)
      .where(inArray(ragDocument.knowledgeBaseId, allKbIds))
      .orderBy(desc(ragDocument.createdAt))
      .limit(allKbIds.length * 5); // Max 5 documents per KB

    // Group documents by knowledge base ID
    const documentsByKbId = recentDocuments.reduce<Record<string, RAGDocument[]>>((acc, doc) => {
      if (!acc[doc.knowledgeBaseId]) {
        acc[doc.knowledgeBaseId] = [];
      }
      if (acc[doc.knowledgeBaseId].length < 5) {
        acc[doc.knowledgeBaseId].push(doc);
      }
      return acc;
    }, {});

    return kbWithStats.map(kb => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      userId: kb.userId,
      visibility: kb.visibility as 'private' | 'public',
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
      documentStats: {
        total: kb.totalDocs || 0,
        ready: kb.readyDocs || 0,
        processing: kb.processingDocs || 0,
        failed: kb.failedDocs || 0,
      },
      documents: documentsByKbId[kb.id] || [],
    }));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get knowledge bases with stats',
    );
  }
}
