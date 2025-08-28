'use client';

import { startTransition, useOptimistic, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CheckCircleFillIcon, ChevronDownIcon, BookIcon } from './icons';
import type { Session } from 'next-auth';
import type { KnowledgeBase } from '@/lib/db/schema';

interface KnowledgeSelectorProps {
  session: Session;
  selectedKnowledgeBaseId: string | null;
  className?: string;
  onKnowledgeBaseChange?: (knowledgeBaseId: string | null) => void;
}

export function KnowledgeSelector({
  session,
  selectedKnowledgeBaseId,
  className,
  onKnowledgeBaseChange,
}: KnowledgeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [optimisticKnowledgeBaseId, setOptimisticKnowledgeBaseId] =
    useOptimistic(selectedKnowledgeBaseId);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKnowledgeBases = async (): Promise<void> => {
      try {
        const response = await fetch('/api/knowledge');
        if (response.ok) {
          const data = await response.json();
          setKnowledgeBases(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch knowledge bases:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchKnowledgeBases();
  }, []);

  const selectedKnowledgeBase = knowledgeBases.find(
    (kb) => kb.id === optimisticKnowledgeBaseId,
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button
          data-testid="knowledge-selector"
          variant="outline"
          className="md:px-2 md:h-[34px] gap-2"
          disabled={loading}
        >
          <BookIcon size={16} />
          {loading ? (
            'Loading...'
          ) : selectedKnowledgeBase ? (
            selectedKnowledgeBase.name
          ) : (
            'No KB'
          )}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            startTransition(() => {
              setOptimisticKnowledgeBaseId(null);
              onKnowledgeBaseChange?.(null);
            });
          }}
          data-active={optimisticKnowledgeBaseId === null}
          asChild
        >
          <button
            type="button"
            className="gap-4 group/item flex flex-row justify-between items-center w-full"
          >
            <div className="flex flex-col gap-1 items-start">
              <div>No Knowledge Base</div>
              <div className="text-xs text-muted-foreground">
                Use general AI knowledge only
              </div>
            </div>
            <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
              <CheckCircleFillIcon />
            </div>
          </button>
        </DropdownMenuItem>

        {knowledgeBases.map((knowledgeBase) => (
          <DropdownMenuItem
            data-testid={`knowledge-selector-item-${knowledgeBase.id}`}
            key={knowledgeBase.id}
            onSelect={() => {
              setOpen(false);
              startTransition(() => {
                setOptimisticKnowledgeBaseId(knowledgeBase.id);
                onKnowledgeBaseChange?.(knowledgeBase.id);
              });
            }}
            data-active={knowledgeBase.id === optimisticKnowledgeBaseId}
            asChild
          >
            <button
              type="button"
              className="gap-4 group/item flex flex-row justify-between items-center w-full"
            >
              <div className="flex flex-col gap-1 items-start">
                <div>{knowledgeBase.name}</div>
                <div className="text-xs text-muted-foreground">
                  {knowledgeBase.description || 'Custom knowledge base'}
                </div>
              </div>
              <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                <CheckCircleFillIcon />
              </div>
            </button>
          </DropdownMenuItem>
        ))}

        {!loading && knowledgeBases.length === 0 && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No knowledge bases available
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}