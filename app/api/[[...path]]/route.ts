export async function GET() {
  return new Response(
    JSON.stringify({ message: "API not available in static export" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export async function POST() {
  return new Response(
    JSON.stringify({ message: "API not available in static export" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
