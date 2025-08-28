# AI Chatbot RAG - Developer Guidelines

Quick reference for maintaining code quality and architectural patterns.

## Tech Stack
```json
{
  "next": "15.3.0-canary.31",
  "react": "19.0.0-rc", 
  "typescript": "^5.6.3",
  "ai": "5.0.0-beta.6",
  "drizzle-orm": "^0.34.0",
  "next-auth": "5.0.0-beta.25",
  "@pinecone-database/pinecone": "^1.1.0"
}
```

## Essential Patterns

### API Routes
```typescript
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.parse(await request.json());
    const session = await auth();
    
    if (!session?.user) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }
    
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof ChatSDKError) return error.toResponse();
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Database Queries (Drizzle)
```typescript
export async function getItems({ userId }: { userId: string }): Promise<Item[]> {
  try {
    return await db.select().from(table).where(eq(table.userId, userId));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get items');
  }
}
```

### React Components
```typescript
// Memoized components
export const Component = memo(({ data }: Props) => (
  <div>{data.name}</div>
), (prev, next) => prev.data.id === next.data.id);

Component.displayName = 'Component';

// forwardRef pattern for UI components
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => (
    <button className={cn(variants({ variant }), className)} ref={ref} {...props} />
  )
);
```

### Error Handling
```typescript
// Use ChatSDKError throughout
export class ChatSDKError extends Error {
  constructor(errorCode: `${ErrorType}:${Surface}`, cause?: string) {}
  toResponse(): Response {}
}

// Surface types: 'chat' | 'auth' | 'api' | 'database' | 'rag'
```

## RAG Architecture

### Document Processing Pipeline
```
1. Upload → Vercel Blob storage
2. Process → Text extraction + chunking
3. Embed → OpenAI embeddings generation  
4. Store → Pinecone vector database
5. Search → Semantic similarity retrieval
6. Inject → Context into chat prompts
```

### Key Files
- `lib/rag/pipeline.ts` - Main document processing
- `lib/rag/embeddings.ts` - OpenAI embedding generation
- `lib/rag/retrieval.ts` - Pinecone search + context building
- `app/api/knowledge/[id]/documents/route.ts` - Upload endpoint
- `components/knowledge-bases-page.tsx` - Management UI

### Vector Search Pattern
```typescript
export async function searchKnowledgeBase({
  query,
  knowledgeBaseId,
  topK = 5
}: SearchParams): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);
  const results = await pinecone.index(indexName).query({
    vector: embedding,
    topK,
    filter: { knowledgeBaseId },
    includeMetadata: true
  });
  
  return results.matches.map(match => ({
    content: match.metadata.content,
    score: match.score,
    source: match.metadata.originalName
  }));
}
```

## Key Conventions

- **Path Mapping**: `@/*` → root directory (not src)
- **Components**: Server by default, `'use client'` for interactivity
- **Auth**: `const session = await auth()` for server-side
- **Styling**: Tailwind with `cn()` utility for merging classes
- **Types**: Explicit return types for all exports

## Development Commands

```bash
pnpm dev          # Development server
pnpm lint         # Next.js + Biome linting  
pnpm db:migrate   # Run database migrations
pnpm build        # Production build
```

## Performance Optimizations

- **React.memo** for expensive components
- **Database indexes** on foreign keys and search columns
- **Redis caching** for frequent queries (implemented)
- **Batch operations** for vector storage
- **Streaming responses** for real-time chat

---

**Remember**: Follow existing patterns, use TypeScript strictly, handle errors gracefully, and optimize for production use.