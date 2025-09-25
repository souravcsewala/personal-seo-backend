const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const fs = require("fs");

const AWS_REGION = process.env.AWS_REGION;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;

let s3Client;
try {
  s3Client = new S3Client({ region: AWS_REGION });
} catch (err) {
  s3Client = null;
}

const generateRandomKey = (prefix = "uploads/") => {
  const random = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  return `${prefix}${now}-${random}`;
};

const uploadToS3 = async ({ buffer, filePath, contentType, key }) => {
  if (!s3Client || !AWS_S3_BUCKET) {
    throw new Error("S3 client not configured. Set AWS_REGION and AWS_S3_BUCKET.");
  }
  const objectKey = key || generateRandomKey();
  const body = buffer ? buffer : (filePath ? fs.createReadStream(filePath) : null);
  if (!body) {
    throw new Error("uploadToS3 requires either buffer or filePath");
  }
  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: objectKey,
    Body: body,
    ContentType: contentType || "application/octet-stream",
  });
  await s3Client.send(command);
  const publicUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${objectKey}`;
  return { key: objectKey, url: publicUrl };
};

const deleteFromS3 = async (key) => {
  if (!s3Client || !AWS_S3_BUCKET || !key) return;
  const command = new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key });
  await s3Client.send(command);
};

module.exports = { uploadToS3, deleteFromS3 };

// Create a time-limited signed URL for a private object
async function getSignedUrlForKey(key, expiresInSeconds = 3600) {
  if (!s3Client || !AWS_S3_BUCKET || !key) return null;
  const command = new GetObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key });
  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

module.exports.getSignedUrlForKey = getSignedUrlForKey;


