import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) {
    return new Response('Missing url', { status: 400 });
  }
  try {
    // Add a 2-second timeout to Facebook fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    let fbRes;
    try {
      fbRes = await fetch(url, {
        headers: {
          'User-Agent': req.headers.get('user-agent') || '',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': 'https://www.facebook.com/'
        },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      // If fetch is aborted or fails, serve fallback
      const fallbackRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/fallback-thumbnail.png`);
      const fallbackBuffer = await fallbackRes.arrayBuffer();
      return new Response(fallbackBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Proxy-Error': 'timeout-or-fetch-failed'
        },
      });
    }
    clearTimeout(timeout);
    if (!fbRes.ok) {
      const errorBody = await fbRes.text();
      console.error(`Proxy error: ${fbRes.status} - ${errorBody}`);
      // Serve fallback image from public directory
      const fallbackRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/fallback-thumbnail.png`);
      const fallbackBuffer = await fallbackRes.arrayBuffer();
      return new Response(fallbackBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Proxy-Error': `${fbRes.status}`
        },
      });
    }
    const contentType = fbRes.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await fbRes.arrayBuffer();
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response('Proxy error', { status: 500 });
  }
}
