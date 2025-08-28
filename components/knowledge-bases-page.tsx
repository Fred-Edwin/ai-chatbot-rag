'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookIcon, PlusIcon, Trash2Icon, UploadIcon, FileTextIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon } from '@/components/icons';
import type { Session } from 'next-auth';
import type { KnowledgeBase, RAGDocument } from '@/lib/db/schema';
import { toast } from './toast';

interface KnowledgeBasesPageProps {
  session: Session;
}

interface KnowledgeBaseWithStats extends KnowledgeBase {
  documentStats: {
    total: number;
    ready: number;
    processing: number;
    failed: number;
  };
  documents: RAGDocument[];
}

// Memoized card component for better performance
const KnowledgeBaseCard = memo(({ 
  kb, 
  uploading, 
  uploadingKBId, 
  onDelete, 
  onFileUpload 
}: {
  kb: KnowledgeBaseWithStats;
  uploading: boolean;
  uploadingKBId: string | null;
  onDelete: (id: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, knowledgeBaseId: string) => void;
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircleIcon className="size-4 text-green-600" />;
      case 'processing':
        return <ClockIcon className="size-4 text-blue-600" />;
      case 'failed':
        return <AlertCircleIcon className="size-4 text-red-600" />;
      default:
        return <ClockIcon className="size-4 text-gray-400" />;
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{kb.name}</CardTitle>
            {kb.description && (
              <CardDescription className="mt-2">{kb.description}</CardDescription>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(kb.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col">
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Documents</span>
            <span className="font-medium">{kb.documentStats?.total || 0}</span>
          </div>
          
          {kb.documentStats && kb.documentStats.total > 0 && (
            <div className="space-y-2">
              {kb.documentStats.ready > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircleIcon className="size-3" />
                    Ready
                  </span>
                  <span>{kb.documentStats.ready}</span>
                </div>
              )}
              {kb.documentStats.processing > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-blue-600">
                    <ClockIcon className="size-3" />
                    Processing
                  </span>
                  <span>{kb.documentStats.processing}</span>
                </div>
              )}
              {kb.documentStats.failed > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertCircleIcon className="size-3" />
                    Failed
                  </span>
                  <span>{kb.documentStats.failed}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Documents */}
        {kb.documents && kb.documents.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">Recent Documents</p>
            <div className="space-y-1">
              {kb.documents.slice(0, 3).map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-sm">
                  <FileTextIcon className="size-3 text-muted-foreground" />
                  <span className="truncate flex-1" title={doc.originalName}>
                    {doc.originalName}
                  </span>
                  {getStatusIcon(doc.status)}
                </div>
              ))}
              {kb.documents.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  +{kb.documents.length - 3} more documents
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4">
          <div className="relative">
            <Input
              type="file"
              multiple
              accept=".txt,.docx"
              onChange={(e) => onFileUpload(e, kb.id)}
              className="absolute inset-0 size-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            <Button 
              variant="outline" 
              className="w-full" 
              disabled={uploading}
            >
              {uploadingKBId === kb.id ? (
                <>
                  <div className="animate-spin rounded-full size-4 border-b-2 border-current mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <UploadIcon size={16} />
                  <span className="ml-2">Upload Documents</span>
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Supports TXT and DOCX files (max 10MB each)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.kb.id === nextProps.kb.id && 
    prevProps.kb.updatedAt === nextProps.kb.updatedAt &&
    prevProps.uploading === nextProps.uploading &&
    prevProps.uploadingKBId === nextProps.uploadingKBId
  );
});

KnowledgeBaseCard.displayName = 'KnowledgeBaseCard';

export function KnowledgeBasesPage({ session }: KnowledgeBasesPageProps) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedKB, setSelectedKB] = useState<KnowledgeBaseWithStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingKBId, setUploadingKBId] = useState<string | null>(null);

  // Form states
  const [newKBName, setNewKBName] = useState('');
  const [newKBDescription, setNewKBDescription] = useState('');
  const [newKBVisibility, setNewKBVisibility] = useState<'private' | 'public'>('private');

  const fetchKnowledgeBases = useCallback(async () => {
    try {
      // Use the optimized API endpoint with stats in single query
      const response = await fetch('/api/knowledge?include=stats');
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBases(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch knowledge bases:', error);
      toast({
        type: 'error',
        description: 'Failed to load knowledge bases',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKnowledgeBases();
  }, [fetchKnowledgeBases]);

  const createKnowledgeBase = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newKBName.trim()) {
      toast({
        type: 'error',
        description: 'Knowledge base name is required',
      });
      return;
    }

    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newKBName.trim(),
          description: newKBDescription.trim() || undefined,
          visibility: newKBVisibility,
        }),
      });

      if (response.ok) {
        toast({
          type: 'success',
          description: 'Knowledge base created successfully',
        });
        setCreateDialogOpen(false);
        setNewKBName('');
        setNewKBDescription('');
        setNewKBVisibility('private');
        fetchKnowledgeBases();
      } else {
        const errorData = await response.json();
        toast({
          type: 'error',
          description: errorData.message || 'Failed to create knowledge base',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to create knowledge base',
      });
    }
  };

  const deleteKnowledgeBase = async (id: string) => {
    if (!confirm('Are you sure you want to delete this knowledge base? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          type: 'success',
          description: 'Knowledge base deleted successfully',
        });
        fetchKnowledgeBases();
      } else {
        const errorData = await response.json();
        toast({
          type: 'error',
          description: errorData.message || 'Failed to delete knowledge base',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to delete knowledge base',
      });
    }
  };

  const uploadFiles = async (files: FileList, knowledgeBaseId: string) => {
    setUploading(true);
    setUploadingKBId(knowledgeBaseId);

    // Show immediate feedback
    toast({
      type: 'success',
      description: `Starting upload of ${files.length} file(s)...`,
    });

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch(`/api/knowledge/${knowledgeBaseId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          type: 'success',
          description: result.message,
        });
        
        // Refresh knowledge bases to show new documents
        // Use setTimeout to prevent UI blocking
        setTimeout(() => {
          fetchKnowledgeBases();
        }, 100);
      } else {
        const errorData = await response.json();
        toast({
          type: 'error',
          description: errorData.message || 'Failed to upload files',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to upload files',
      });
    } finally {
      setUploading(false);
      setUploadingKBId(null);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, knowledgeBaseId: string) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      uploadFiles(files, knowledgeBaseId);
      // Reset the input to allow re-uploading the same files
      event.target.value = '';
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full size-8 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading knowledge bases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookIcon size={32} />
            <span className="ml-2">Knowledge Bases</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your knowledge bases and upload documents to enhance your AI conversations.
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon size={16} />
              <span className="ml-2">Create Knowledge Base</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={createKnowledgeBase}>
              <DialogHeader>
                <DialogTitle>Create New Knowledge Base</DialogTitle>
                <DialogDescription>
                  Create a new knowledge base to organize your documents and enhance AI conversations.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 my-4">
                <div>
                  <Label htmlFor="kb-name">Name *</Label>
                  <Input
                    id="kb-name"
                    value={newKBName}
                    onChange={(e) => setNewKBName(e.target.value)}
                    placeholder="e.g., Company Policies, Research Papers"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="kb-description">Description</Label>
                  <Textarea
                    id="kb-description"
                    value={newKBDescription}
                    onChange={(e) => setNewKBDescription(e.target.value)}
                    placeholder="Optional description of what this knowledge base contains"
                    rows={3}
                  />
                </div>
                
                <div>
                  <Label htmlFor="kb-visibility">Visibility</Label>
                  <Select value={newKBVisibility} onValueChange={(value: 'private' | 'public') => setNewKBVisibility(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private (only you)</SelectItem>
                      <SelectItem value="public">Public (visible to others)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Knowledge Base</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {knowledgeBases.length === 0 ? (
        <div className="text-center py-12">
          <BookIcon size={64} />
          <h2 className="text-xl font-semibold mb-2">No knowledge bases yet</h2>
          <p className="text-muted-foreground mb-4">
            Create your first knowledge base to start uploading documents and enhancing your AI conversations.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <PlusIcon size={16} />
            <span className="ml-2">Create Your First Knowledge Base</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {knowledgeBases.map((kb) => (
            <KnowledgeBaseCard
              key={kb.id}
              kb={kb}
              uploading={uploading}
              uploadingKBId={uploadingKBId}
              onDelete={deleteKnowledgeBase}
              onFileUpload={handleFileUpload}
            />
          ))}
        </div>
      )}
    </div>
  );
}