// functions/api/image/[[key]].js
// Cloudflare Pages Function: Secure Private Image Proxy with IDOR Protection
// Fetches private object from Cloudflare R2 bucket (CMS_BUCKET) and streams securely to authenticated user

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Resolve R2 Object Key
    let rawKey = params.key;
    if (Array.isArray(rawKey)) {
      rawKey = rawKey.join('/');
    }
    if (!rawKey) {
      return new Response(JSON.stringify({ error: 'Image key is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const objectKey = decodeURIComponent(rawKey).replace(/^r2:/, '');

    // 2. Authentication & Authorization Check
    const url = new URL(request.url);
    const tokenFromQuery = url.searchParams.get('token');
    const authHeader = request.headers.get('Authorization') || '';
    const token = (authHeader.replace(/^Bearer\s+/i, '') || tokenFromQuery || '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing session token for private biometric object.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify token with Supabase Auth
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const supabaseAnonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

    let callerUser = null;
    if (supabaseUrl) {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey || '',
        },
      });

      if (!userRes.ok) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or expired Supabase session.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      callerUser = await userRes.json();
    }

    // 3. IDOR Protection:
    // If requester is a student, verify they are only accessing their own profile picture or authorized assets
    if (callerUser && callerUser.email && callerUser.email.includes('@student.incubation.local')) {
      const studentRollFromEmail = callerUser.email.split('@')[0].toUpperCase();
      const upperKey = objectKey.toUpperCase();
      if (!upperKey.includes(studentRollFromEmail) && !upperKey.startsWith('PUBLIC/')) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: You do not have permission to view other students\' biometric data.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Retrieve Private Object from Cloudflare R2
    if (!env.CMS_BUCKET) {
      // In local dev without R2 binding, return placeholder
      return new Response(JSON.stringify({ message: 'R2 bucket CMS_BUCKET binding not configured locally.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const object = await env.CMS_BUCKET.get(objectKey);
    if (!object) {
      return new Response(JSON.stringify({ error: `File '${objectKey}' not found in private storage.` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Stream image with security headers
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, no-transform, max-age=3600');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, {
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Error streaming R2 image' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
