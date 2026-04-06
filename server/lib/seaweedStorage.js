'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const endpoint  = process.env.SEAWEED_ENDPOINT;
const accessKey = process.env.SEAWEED_ACCESS_KEY;
const secretKey = process.env.SEAWEED_SECRET_KEY;
const bucket    = process.env.SEAWEED_BUCKET;
const region    = process.env.SEAWEED_REGION || 'us-east-1';

if (!endpoint || !accessKey || !secretKey || !bucket) {
  console.warn('[seaweedStorage] Missing one or more SEAWEED_* env vars — file uploads will fail');
}

const client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: true, // required for SeaweedFS S3 — bucket in path, not subdomain
});

/**
 * Upload a buffer to SeaweedFS.
 * @param {Buffer} buffer
 * @param {string} key      — S3 object key (e.g. "attachments/uuid.pdf")
 * @param {string} mimeType
 */
async function uploadFile(buffer, key, mimeType) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));
}

/**
 * Stream an object from SeaweedFS into an Express response.
 * Callers should set res.setHeader('Content-Type', ...) before calling this.
 * @param {string} key
 * @param {import('express').Response} res
 */
async function streamFile(key, res) {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  result.Body.pipe(res);
}

/**
 * Fetch an object from SeaweedFS and return it as a Buffer.
 * Used for email attachments where we need the raw bytes, not a stream.
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
async function getFileBuffer(key) {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return new Promise((resolve, reject) => {
    const chunks = [];
    result.Body.on('data', (chunk) => chunks.push(chunk));
    result.Body.on('end',  () => resolve(Buffer.concat(chunks)));
    result.Body.on('error', reject);
  });
}

/**
 * Delete an object from SeaweedFS.
 * @param {string} key
 */
async function deleteFile(key) {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

module.exports = { uploadFile, streamFile, getFileBuffer, deleteFile };
