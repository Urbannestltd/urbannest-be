import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// 1. Force load .env from the root directory
dotenv.config();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("--- SUPABASE STORAGE DOCTOR ---");
console.log(`Checking URL: ${URL}`);
console.log(`Checking KEY: ${KEY ? "Loaded (Hidden)" : "MISSING ❌"}`);

if (!URL || !KEY) {
  console.error("❌ STOP: Missing Environment Variables.");
  process.exit(1);
}

const supabase = createClient(URL, KEY);

async function runCheck() {
  try {
    // TEST 1: Can we talk to Supabase at all? (List Buckets)
    console.log("\n1. Testing Connection & Listing Buckets...");
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      console.error("❌ CONNECTION FAILED.");
      console.error("   Error details:", error.message);
      console.error(
        "   Troubleshooting: Check if SUPABASE_URL has no extra paths like '/storage/v1'",
      );
      return;
    }

    console.log("✅ Connection Successful!");
    console.log(
      "   Buckets found:",
      buckets.map((b) => b.name),
    );

    // TEST 2: Does the specific bucket exist?
    const TARGET_BUCKET = "Urbannest";
    const bucketExists = buckets.find((b) => b.name === TARGET_BUCKET);

    if (!bucketExists) {
      console.error(
        `\n❌ BUCKET ERROR: Bucket '${TARGET_BUCKET}' does not exist.`,
      );
      console.log(
        `   Please go to Supabase Dashboard -> Storage -> Create New Bucket named '${TARGET_BUCKET}'`,
      );
      return;
    }

    console.log(`✅ Bucket '${TARGET_BUCKET}' verified.`);

    // TEST 3: Can we generate a Signed URL?
    console.log("\n3. Testing Signed URL Generation...");
    const { data: urlData, error: urlError } = await supabase.storage
      .from(TARGET_BUCKET)
      .createSignedUploadUrl("doctor-test.txt");

    if (urlError) {
      console.error("❌ SIGNED URL FAILED.");
      console.error("   Error details:", urlError);
    } else {
      console.log("✅ SUCCESS! Signed URL generated:");
      console.log("   " + urlData?.signedUrl.substring(0, 50) + "...");
    }
  } catch (err: any) {
    console.error("\n❌ CRITICAL UNHANDLED ERROR:");
    console.error(err);
  }
}

runCheck();
