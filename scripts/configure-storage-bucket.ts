import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_BUCKET = "Urbannest";

// Mirrors the extension allow-list in src/utils/fileUploadValidation.ts.
// Enforced by Supabase's own storage server on every upload (including the
// direct client -> Supabase PUT via a signed URL), independent of anything
// our Express backend validates at sign-url time.
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

const FILE_SIZE_LIMIT = "50MB";

if (!URL || !KEY) {
  console.error("STOP: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from environment.");
  process.exit(1);
}

const supabase = createClient(URL, KEY);

async function run() {
  const { data: bucket, error: getError } = await supabase.storage.getBucket(TARGET_BUCKET);
  if (getError || !bucket) {
    console.error(`Bucket '${TARGET_BUCKET}' not found:`, getError?.message);
    process.exit(1);
  }

  const { error } = await supabase.storage.updateBucket(TARGET_BUCKET, {
    public: bucket.public,
    fileSizeLimit: FILE_SIZE_LIMIT,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });

  if (error) {
    console.error("Failed to update bucket:", error.message);
    process.exit(1);
  }

  console.log(`Bucket '${TARGET_BUCKET}' updated:`);
  console.log(`  fileSizeLimit: ${FILE_SIZE_LIMIT}`);
  console.log(`  allowedMimeTypes: ${ALLOWED_MIME_TYPES.join(", ")}`);
}

run();
