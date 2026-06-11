import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

if (
  !process.env.S3_ENDPOINT ||
  !process.env.S3_ACCESS_KEY_ID ||
  !process.env.S3_SECRET_ACCESS_KEY
) {
  throw new Error(
    'S3_ENDPOINT, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY sont requis. ' +
      'Copier .env.example vers .env.local et démarrer MinIO via `docker compose up -d`.',
  );
}

const bucket = process.env.S3_BUCKET_DOCUMENTS ?? 'erp-btp-documents';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const DEFAULT_EXPIRES_IN_SECONDS = 600;

export async function getUploadUrl(key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: DEFAULT_EXPIRES_IN_SECONDS },
  );
}

export async function getDownloadUrl(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: DEFAULT_EXPIRES_IN_SECONDS,
  });
}

/** Upload direct côté serveur (server actions, taille raisonnable). */
export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
