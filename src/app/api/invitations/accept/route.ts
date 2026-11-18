import { acceptInvitation } from '@/lib/invitation-acceptance-service';

export async function POST(request: Request) {
  return acceptInvitation(request);
}
