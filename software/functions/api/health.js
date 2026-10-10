// functions/api/health.js
// Cloudflare Pages Function: Health Check Proxy for AI OCR Backend

export async function onRequestGet(context) {
  const { env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  const rawBackend = (env.OCR_API_URL || env.VITE_OCR_API_URL || '').trim();
  const backendBase = rawBackend.replace(/\/+$/, '');

  if (!backendBase) {
    return new Response(
      JSON.stringify({
        status: 'unconfigured',
        ready: false,
        message: 'OCR backend URL is not configured in Cloudflare Pages environment variables.',
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  try {
    const backendRes = await fetch(`${backendBase}/api/health`, {
      method: 'GET',
    });

    const data = await backendRes.text();
    return new Response(data, {
      status: backendRes.status,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: 'offline',
        ready: false,
        error: `Could not reach OCR backend at ${backendBase}: ${err.message}`,
      }),
      { status: 200, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
