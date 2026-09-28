// src/lib/crypto.ts
// Encrypts/decrypts API keys using Web Crypto API (AES-GCM).
// The encryption key is derived once and stored in chrome.storage.local.

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const STORAGE_KEY = '__sh_enc_key__';

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]) {
    const raw = Uint8Array.from(atob(stored[STORAGE_KEY]), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: ALGO, length: KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ]);
  const exported = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  await chrome.storage.local.set({ [STORAGE_KEY]: b64 });
  return key;
}

export async function encrypt(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
  };
}

export async function decrypt(ciphertext: string, iv: string): Promise<string> {
  const key = await getOrCreateKey();
  const ivBuf = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const ctBuf = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv: ivBuf }, key, ctBuf);
  return new TextDecoder().decode(decrypted);
}
