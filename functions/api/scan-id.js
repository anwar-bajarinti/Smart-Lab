// functions/api/scan-id.js
// Cloudflare Pages Function: Reverse Proxy for AI OCR ID Card Scanning
// Securely proxies /api/scan-id requests to the production Python FastAPI backend

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  const rawBackend = (env.OCR_API_URL || env.VITE_OCR_API_URL || '').trim();
  const backendBase = rawBackend.replace(/\/+$/, '');

  if (!backendBase) {
    return new Response(
      JSON.stringify({
        status: 'pending',
        name: null,
        roll_number: null,
        all_tokens: [],
        latency_ms: 0,
        error: 'OCR backend URL is not configured. Set VITE_OCR_API_URL or OCR_API_URL in Cloudflare Pages environment variables.',
      }),
      { status: 503, headers: corsHeaders }
    );
  }

  try {
    const body = await request.text();
    const backendRes = await fetch(`${backendBase}/api/scan-id`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
      body,
    });

    const data = await backendRes.text();
    return new Response(data, {
      status: backendRes.status,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: 'pending',
        name: null,
        roll_number: null,
        all_tokens: [],
        latency_ms: 0,
        error: `Failed to proxy to OCR backend: ${err.message}`,
      }),
      { status: 502, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
