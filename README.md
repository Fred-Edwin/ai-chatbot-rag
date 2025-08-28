# AI Chatbot with RAG

A production-ready AI chatbot built with Next.js 15 and enhanced with RAG (Retrieval-Augmented Generation) capabilities for knowledge base integration.

## ✨ Features

### Core Chatbot
- **Next.js App Router** with React Server Components and Server Actions
- **AI SDK Integration** - Support for OpenAI, Anthropic, xAI and other providers
- **Real-time Streaming** - Streamed chat responses with typing indicators
- **Chat History** - Persistent conversation storage with PostgreSQL
- **Authentication** - Secure auth with NextAuth.js
- **Modern UI** - Responsive design with shadcn/ui and Tailwind CSS

### RAG Enhancement
- **Knowledge Base Management** - Create and organize document collections
- **Multi-format Support** - Process PDF, DOCX, and TXT documents
- **Vector Search** - Semantic similarity search with Pinecone
- **Document Processing** - Automated chunking and embedding generation
- **Context Integration** - Seamlessly inject relevant knowledge into chat responses
- **Dual Mode** - Switch between general AI chat and knowledge-enhanced conversations

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- PostgreSQL database (we recommend [Neon](https://neon.tech/))
- [Pinecone](https://www.pinecone.io/) account for vector storage
- OpenAI API key for embeddings and chat
- Vercel account for deployment (optional)

### Environment Setup

1. **Clone and install**:
   ```bash
   git clone <your-repo-url>
   cd ai-chatbot
   pnpm install
   ```

2. **Configure environment** (copy `.env.example` to `.env.local`):
   ```bash
   # Database
   POSTGRES_URL="postgresql://..."
   
   # Authentication  
   AUTH_SECRET="generate-with-openssl-rand"
   
   # AI Provider (choose one)
   OPENAI_API_KEY="sk-..."
   # or
   ANTHROPIC_API_KEY="sk-ant-..."
   
   # RAG Components
   PINECONE_API_KEY="your-pinecone-key"
   PINECONE_INDEX_NAME="your-index-name"
   
   # File Storage
   BLOB_READ_WRITE_TOKEN="vercel-blob-token"
   ```

3. **Database setup**:
   ```bash
   pnpm db:migrate
   ```

4. **Start development**:
   ```bash
   pnpm dev
   ```

Visit `http://localhost:3000` to see your chatbot in action!

## 📁 Project Structure

```
app/
├── (auth)/                 # Authentication pages
├── (chat)/                 # Chat interface and API
├── knowledge/              # Knowledge base management UI
└── api/
    ├── chat/              # Chat API with RAG integration
    └── knowledge/         # Knowledge base CRUD operations

components/
├── ui/                    # shadcn/ui components
├── chat.tsx              # Main chat interface
├── chat-header.tsx       # Chat controls and KB selector
├── knowledge-*.tsx       # Knowledge base UI components
└── ...

lib/
├── ai/                   # AI provider configurations
├── db/                   # Database schema and queries
├── rag/                  # RAG pipeline components
│   ├── pipeline.ts       # Document processing
│   ├── embeddings.ts     # Vector generation
│   ├── retrieval.ts      # Semantic search
│   └── pinecone.ts       # Vector database ops
└── ...
```

## 🔧 RAG System Architecture

### Data Flow
1. **Upload** → Documents stored in Vercel Blob
2. **Process** → Text extraction → Chunking → Embedding generation
3. **Store** → Vector embeddings saved to Pinecone with metadata
4. **Query** → User message → Semantic search → Context retrieval
5. **Generate** → RAG-enhanced prompt → AI response with sources

### API Endpoints
- `GET /api/knowledge` - List user's knowledge bases
- `POST /api/knowledge` - Create new knowledge base
- `POST /api/knowledge/[id]/documents` - Upload documents
- `POST /api/knowledge/[id]/search` - Search within knowledge base
- `POST /api/chat` - RAG-enhanced chat (auto-detects KB selection)

## 🎯 Usage Examples

### Basic Chat
Simply start typing to chat with AI. Toggle between different AI models using the model selector.

### Knowledge-Enhanced Chat
1. **Create Knowledge Base**: Visit `/knowledge` to create your first knowledge base
2. **Upload Documents**: Add PDF, DOCX, or TXT files to your knowledge base
3. **Select in Chat**: Use the knowledge base dropdown in the chat header
4. **Ask Questions**: Your questions will now be answered using your documents

Example:
```
👤 "What are the key findings in the research papers?"
🤖 "Based on your uploaded research documents, the key findings include..."
   📄 Sources: research-paper-1.pdf, analysis-report.docx
```

## 🚀 Deployment

### Vercel (Recommended)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fai-chatbot-rag)

1. Connect your GitHub repository
2. Configure environment variables in Vercel dashboard
3. Deploy automatically with each push to main

### Self-Hosted
```bash
pnpm build
pnpm start
```

Ensure your environment variables are set in production.

## 🔧 Development

### Key Commands
```bash
pnpm dev          # Start development server
pnpm build        # Build for production  
pnpm lint         # Run ESLint and Biome
pnpm db:migrate   # Run database migrations
pnpm db:seed      # Seed database (if available)
```

### Adding AI Providers
The project uses Vercel AI SDK. To add a new provider:

1. Install the provider package
2. Configure in `lib/ai/providers.ts`
3. Add environment variables
4. Update model selector component

See [AI SDK Providers](https://sdk.vercel.ai/providers) for supported providers.

### Customizing RAG
- **Chunking**: Modify `lib/rag/pipeline.ts` for different chunk sizes
- **Embeddings**: Switch embedding models in `lib/rag/embeddings.ts`  
- **Search**: Tune similarity thresholds in `lib/rag/retrieval.ts`
- **UI**: Customize knowledge base interface in `components/knowledge-*.tsx`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes following the existing code patterns
4. Ensure tests pass: `pnpm lint`
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with**: Next.js 15, React 19, TypeScript, Tailwind CSS, Pinecone, OpenAI