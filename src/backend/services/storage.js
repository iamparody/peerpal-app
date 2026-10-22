'use strict';

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');


const BUCKET = 'therapists-docs';

const ALLOWED_DOCUMENT_TYPES = new Set([
  'photo', 'kcpa_cert', 'academic_cert', 'indemnity', 'good_conduct', 'agreement',
]);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for document storage');
  }
  const WebSocket = require('ws');
  _client = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket },
  });
  return _client;
}

function buildPath(userId, documentType, filename) {
  const safe = filename.replace(/[/\\.\0]/g, '_').slice(0, 100);
  return `${userId}/${documentType}/${safe}`;
}

async function uploadDocument({ userId, documentType, filename, mimeType, buffer, bucket = BUCKET }) {
  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    throw Object.assign(new Error(`Invalid document_type: ${documentType}`), { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error('Only PDF, JPEG, PNG, and WEBP files are accepted'), { status: 400 });
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error('File exceeds 10 MB limit'), { status: 400 });
  }

  const path = buildPath(userId, documentType, filename);
  const supabase = getClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: mimeType, upsert: true });

  if (error) throw Object.assign(new Error(`Storage upload failed: ${error.message}`), { status: 502 });

  return { path };
}

function getPublicUrl(bucket, path) {
  const supabase = getClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function getSignedUrl(path) {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (error) throw new Error(`Could not generate signed URL: ${error.message}`);
  return data.signedUrl;
}

async function deleteDocument(path) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) logger.warn('[storage] delete failed:', error.message);
}

const PHOTO_BUCKET = 'therapist-photos';

module.exports = { uploadDocument, getSignedUrl, getPublicUrl, deleteDocument, ALLOWED_DOCUMENT_TYPES, BUCKET, PHOTO_BUCKET };
