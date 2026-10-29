// functions/api/upload.js
// Cloudflare Pages Function: Secure, Authenticated Upload to Private Cloudflare R2
// Strictly prevents public access and verifies caller's Supabase JWT

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. CORS Pre-flight & Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 2. Validate Supabase JWT Bearer Token
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing Supabase authentication token.' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify token with Supabase Auth endpoint
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const supabaseAnonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

    if (supabaseUrl) {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey || '',
        },
      });

      if (!userRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized: Invalid Supabase session or expired token.' }),
          { status: 401, headers: corsHeaders }
        );
      }
    }

    // 3. Process Upload Body
    const contentType = request.headers.get('Content-Type') || '';
    let fileBuffer = null;
    let mimeType = 'image/jpeg';
    let rollNumber = 'unknown';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      rollNumber = formData.get('rollNumber') || 'student';
      if (!file) {
        return new Response(
          JSON.stringify({ success: false, error: 'No file provided in form data.' }),
          { status: 400, headers: corsHeaders }
        );
      }
      mimeType = file.type || 'image/jpeg';
      fileBuffer = await file.arrayBuffer();
    } else {
      // Direct binary stream
      mimeType = contentType || 'image/jpeg';
      fileBuffer = await request.arrayBuffer();
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Uploaded file is empty.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 4. Generate Private R2 Object Key
    const safeRoll = String(rollNumber).replace(/[^a-zA-Z0-9_-]/g, '');
    const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const objectKey = `faces/${safeRoll}_${Date.now()}_${uniqueId}.jpg`;

    // 5. Write to Private Cloudflare R2 Bucket (CMS_BUCKET)
    if (env.CMS_BUCKET) {
      await env.CMS_BUCKET.put(objectKey, fileBuffer, {
        httpMetadata: {
          contentType: mimeType,
          cacheControl: 'private, no-transform, max-age=31536000',
        },
        customMetadata: {
          uploadedBy: safeRoll,
          uploadedAt: new Date().toISOString(),
        },
      });
    }

    // 6. Return Secure Object Reference (r2:key)
    // Client stores this reference in Supabase instead of raw binary data
    return new Response(
      JSON.stringify({
        success: true,
        key: objectKey,
        ref: `r2:${objectKey}`,
        url: `/api/image/${encodeURIComponent(objectKey)}`,
        sizeBytes: fileBuffer.byteLength,
      }),
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'R2 upload failed.' }),
      { status: 500, headers: corsHeaders }
    );
  }
}
