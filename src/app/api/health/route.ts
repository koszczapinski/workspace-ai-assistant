// Shallow liveness for Docker Compose and the Deployer: no Session, no database, no environment.
// It must stay content-free; a database outage must not restart the app container.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
