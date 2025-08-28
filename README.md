# AI Chatbot with RAG

A modern AI chatbot application enhanced with Retrieval-Augmented Generation (RAG) capabilities, allowing users to chat with their documents in real-time.

## 🚀 Features

- **Multi-Provider AI Chat** - Support for OpenAI, Anthropic, and xAI models
- **Document Intelligence** - Upload PDFs, DOCX, and TXT files to create knowledge bases
- **Vector Search** - Semantic search through your documents using Pinecone
- **Real-time Processing** - Stream responses with live document processing updates
- **Knowledge Management** - Organize documents into searchable knowledge bases
- **Modern UI** - Clean, responsive interface built with Next.js 15 and React 19

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, Drizzle ORM, PostgreSQL
- **AI/RAG**: Vercel AI SDK, OpenAI Embeddings, Pinecone Vector DB
- **Auth**: NextAuth.js
- **Storage**: Vercel Blob, Upstash Redis

## 🏃‍♂️ Quick Start

### Prerequisites

- Node.js 18+ with pnpm
- PostgreSQL database
- Pinecone account for vector storage
- OpenAI API key

### Installation

1. **Clone and install dependencies**:
   ```bash
   git clone https://github.com/Fred-Edwin/ai-chatbot-rag.git
   cd ai-chatbot-rag
   pnpm install
   ```

2. **Set up environment variables** (copy `.env.example` to `.env.local`):
   ```env
   # Database
   POSTGRES_URL="your-postgres-connection-string"
   
   # Authentication
   AUTH_SECRET="your-auth-secret"
   
   # AI Provider
   OPENAI_API_KEY="your-openai-key"
   
   # Vector Database
   PINECONE_API_KEY="your-pinecone-key"
   PINECONE_INDEX_NAME="your-index-name"
   
   # File Storage
   BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"
   ```

3. **Run database migrations**:
   ```bash
   pnpm db:migrate
   ```

4. **Start the development server**:
   ```bash
   pnpm dev
   ```

Visit `http://localhost:3000` to start chatting!

## 📖 Usage

1. **Create a Knowledge Base**: Navigate to the Knowledge page to create your first knowledge base
2. **Upload Documents**: Add PDF, DOCX, or TXT files to your knowledge base
3. **Start Chatting**: Select your knowledge base from the chat interface and ask questions about your documents

## 🏗️ Architecture

The application implements a complete RAG pipeline:

```
Document Upload → Text Processing → Chunking → Vector Embeddings → Pinecone Storage
                                                                           ↓
User Question → Semantic Search → Context Retrieval → AI Response with Sources
```

## 🚀 Deployment

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFred-Edwin%2Fai-chatbot-rag)

Or deploy manually:
```bash
pnpm build
pnpm start
```

## 📝 Development

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm lint         # Run linting
pnpm db:migrate   # Run database migrations
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).