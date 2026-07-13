// Liveness endpoint used by the docker-compose frontend healthcheck and the CI
// health-wait (scripts/wait-for-health.sh). force-dynamic so it isn't
// statically prerendered and always reflects a live server.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
