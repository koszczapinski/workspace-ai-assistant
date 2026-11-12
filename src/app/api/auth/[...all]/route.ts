import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
export const { GET, POST } = auth ? toNextJsHandler(auth) : { GET:()=>new Response('Auth unavailable',{status:503}), POST:()=>new Response('Auth unavailable',{status:503}) };
