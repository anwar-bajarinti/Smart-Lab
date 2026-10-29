// src/services/storage/storageService.js
// Cloudflare R2 / Object Storage Abstraction Layer
//
// NOTE ON ARCHITECTURE & SAFETY:
// In compliance with project storage safety guidelines, large binary file uploads
// (high-resolution camera photos, long videos, bulky PDFs, APK installers) are postponed.
// This abstraction provides clean hook points for future Cloudflare R2 bucket integration
// without requiring arbitrary cloud credentials or filling up the database with base64 blobs.

export const STORAGE_PROVIDERS = {
  LOCAL_METADATA_ONLY: 'LOCAL_METADATA_ONLY',
  CLOUDFLARE_R2: 'CLOUDFLARE_R2',
  EXTERNAL_LINK: 'EXTERNAL_LINK',
};

class StorageService {
  constructor() {
    this.provider = STORAGE_PROVIDERS.LOCAL_METADATA_ONLY;
    this.r2Endpoint = (typeof process !== 'undefined' && process.env?.VITE_R2_ENDPOINT) || '';
  }

  /**
   * Upload validation hook.
   * Rejects large file uploads (max 50KB for avatars/icons).
   */
  validateUploadPayload(fileOrBlob, maxSizeBytes = 50 * 1024) {
    if (!fileOrBlob) {
      throw new Error('No file provided for upload.');
    }
    const size = fileOrBlob.size || 0;
    if (size > maxSizeBytes) {
      throw new Error(
        `File upload postponed: Size (${Math.round(size / 1024)} KB) exceeds safety limit of ${Math.round(maxSizeBytes / 1024)} KB. Use external URLs (e.g. GitHub/DOI) instead.`
      );
    }
    return true;
  }

  /**
   * Generates a safe metadata reference or URL.
   */
  async uploadFile(fileOrBlob, category = 'avatar') {
    this.validateUploadPayload(fileOrBlob);
    
    // For now, in safe metadata mode, convert lightweight thumbnails or reject heavy files
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ url: reader.result, provider: 'inline_data' });
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrBlob);
    });
  }

  /**
   * Formats external resource links (e.g., GitHub repo, DOI research link, APK mirror).
   */
  formatResourceUrl(rawUrl, fallbackLabel = 'Open Link') {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }
}

export const storageService = new StorageService();
export default storageService;
