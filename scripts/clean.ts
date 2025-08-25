#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Clean script for removing build artifacts and temporary files
 * Usage: deno task clean
 */

import { exists } from "@std/fs";

const CLEAN_TARGETS = [
  "coverage",
  "dist",
  "docs.json",
  ".deno_dir",
  "*.log",
  "temp",
  "node_modules", // Just in case
];

async function cleanDirectory(path: string): Promise<boolean> {
  try {
    if (await exists(path)) {
      await Deno.remove(path, { recursive: true });
      console.log(`🗑️  Removed: ${path}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Failed to remove ${path}:`, error.message);
    return false;
  }
}

async function cleanGlob(pattern: string): Promise<number> {
  let count = 0;
  try {
    for await (const entry of Deno.readDir(".")) {
      if (entry.name.match(new RegExp(pattern.replace("*", ".*")))) {
        await cleanDirectory(entry.name);
        count++;
      }
    }
  } catch (error) {
    console.error(`❌ Failed to clean pattern ${pattern}:`, error.message);
  }
  return count;
}

async function main() {
  console.log("🧹 Starting cleanup process...");

  let cleaned = 0;

  for (const target of CLEAN_TARGETS) {
    if (target.includes("*")) {
      cleaned += await cleanGlob(target);
    } else {
      if (await cleanDirectory(target)) {
        cleaned++;
      }
    }
  }

  console.log(`✨ Cleanup complete! Removed ${cleaned} items.`);
}

if (import.meta.main) {
  main();
}
