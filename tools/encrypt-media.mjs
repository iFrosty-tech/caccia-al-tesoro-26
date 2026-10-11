#!/usr/bin/env node
// Encrypts a media file for a timed riddle (Node >= 20, no dependencies).
//
// Usage:
//   node tools/encrypt-media.mjs <input> <output> [--key <base64>]
//
// Writes <output> as IV (12 bytes) || ciphertext || GCM tag (16 bytes), the layout the
// browser decrypts with WebCrypto AES-GCM once the IV is split off.
// Prints ONLY the base64 key on stdout: put it in the Apps Script Script Property
// MEDIA_KEY_<id> and never commit it. Without --key a fresh random 32-byte key is generated.

import { createCipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const IV_BYTES = 12;
const KEY_BYTES = 32;

function fail(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
}

function parseArgs(argv) {
  const files = [];
  let key = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--key") {
      const value = argv[++i];
      if (!value) fail("--key needs a base64 value.");
      key = Buffer.from(value, "base64");
      if (key.length !== KEY_BYTES) fail("--key must decode to exactly 32 bytes.");
    } else {
      files.push(argv[i]);
    }
  }
  if (files.length !== 2) {
    fail("Usage: node tools/encrypt-media.mjs <input> <output> [--key <base64>]");
  }
  return { input: files[0], output: files[1], key: key || randomBytes(KEY_BYTES) };
}

const { input, output, key } = parseArgs(process.argv.slice(2));
if (resolve(input) === resolve(output)) fail("Input and output must be different files.");

const plain = await readFile(input);
const iv = randomBytes(IV_BYTES);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
await writeFile(output, Buffer.concat([iv, body, cipher.getAuthTag()]));

process.stderr.write(`Encrypted ${plain.length} bytes -> ${output}\n`);
process.stdout.write(key.toString("base64") + "\n");
