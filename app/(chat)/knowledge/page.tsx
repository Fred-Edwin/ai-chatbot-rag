import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import { KnowledgeBasesPage } from '@/components/knowledge-bases-page';

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  return <KnowledgeBasesPage session={session} />;
}