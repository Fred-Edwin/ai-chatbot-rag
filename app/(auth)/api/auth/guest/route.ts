import { signIn, auth } from '@/app/(auth)/auth';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get('redirectUrl') || '/';

  try {
    const session = await auth();
    
    if (session?.user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch (error) {
    // If auth fails, continue with guest sign in
    console.log('Auth check failed, proceeding with guest auth');
  }

  return signIn('guest', { redirect: true, redirectTo: redirectUrl });
}
