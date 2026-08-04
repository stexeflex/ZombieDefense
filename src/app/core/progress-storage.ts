const STORAGE_PREFIX = 'ZD2.';
const BLOCK_BYTES = 8;
const NONCE_BYTES = 8;
const TAG_BYTES = 8;

/*
 * The key has to ship with a browser game, so this is intentionally a
 * tamper-resistant seal rather than account-grade security. It keeps progress
 * out of plain sight and makes a hand-edited payload fail its authentication
 * tag. Truly cheat-proof progress would have to live behind a player account
 * on the server.
 */
const CIPHER_KEY = new Uint32Array([0x5a44325f, 0x7c91e42b, 0x13f0a865, 0xb6d24c39]);
const MAC_KEY = new Uint32Array([0xd84b1f27, 0x4296ac53, 0xf0375d91, 0x6be2c408]);

function xtea(left: number, right: number, key: Uint32Array): [number, number] {
  let sum = 0;
  const delta = 0x9e3779b9;
  let first = left >>> 0;
  let second = right >>> 0;
  for (let round = 0; round < 32; round += 1) {
    first =
      (first +
        (((((second << 4) ^ (second >>> 5)) + second) >>> 0) ^ ((sum + key[sum & 3]) >>> 0))) >>>
      0;
    sum = (sum + delta) >>> 0;
    second =
      (second +
        (((((first << 4) ^ (first >>> 5)) + first) >>> 0) ^
          ((sum + key[(sum >>> 11) & 3]) >>> 0))) >>>
      0;
  }
  return [first, second];
}

function word(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function writeWord(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function randomNonce() {
  const nonce = new Uint8Array(NONCE_BYTES);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(nonce);
  } else {
    for (let index = 0; index < nonce.length; index += 1) {
      nonce[index] = Math.floor(Math.random() * 256);
    }
  }
  return nonce;
}

function crypt(input: Uint8Array, nonce: Uint8Array) {
  const output = new Uint8Array(input.length);
  const nonceLeft = word(nonce, 0);
  const nonceRight = word(nonce, 4);
  for (let offset = 0, counter = 0; offset < input.length; offset += BLOCK_BYTES, counter += 1) {
    const [left, right] = xtea(nonceLeft ^ counter, (nonceRight + counter) >>> 0, CIPHER_KEY);
    const stream = new Uint8Array(BLOCK_BYTES);
    writeWord(stream, 0, left);
    writeWord(stream, 4, right);
    for (let index = 0; index < BLOCK_BYTES && offset + index < input.length; index += 1) {
      output[offset + index] = input[offset + index] ^ stream[index];
    }
  }
  return output;
}

/** XTEA CBC-MAC over the exact payload and its byte length. */
function tag(payload: Uint8Array) {
  let left = payload.length >>> 0;
  let right = 0x5a44324d;
  const paddedLength = Math.ceil((payload.length + 1) / BLOCK_BYTES) * BLOCK_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(payload);
  padded[payload.length] = 0x80;
  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    [left, right] = xtea(left ^ word(padded, offset), right ^ word(padded, offset + 4), MAC_KEY);
  }
  const result = new Uint8Array(TAG_BYTES);
  writeWord(result, 0, left);
  writeWord(result, 4, right);
  return result;
}

function sameBytes(first: Uint8Array, second: Uint8Array) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index] ^ second[index];
  return difference === 0;
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Encrypts and authenticates a JSON-compatible local progress object. */
export function sealProgressStorage(value: unknown) {
  const clear = new TextEncoder().encode(JSON.stringify(value));
  const nonce = randomNonce();
  const encrypted = crypt(clear, nonce);
  const payload = new Uint8Array(NONCE_BYTES + encrypted.length);
  payload.set(nonce);
  payload.set(encrypted, NONCE_BYTES);
  const authentication = tag(payload);
  const sealed = new Uint8Array(payload.length + authentication.length);
  sealed.set(payload);
  sealed.set(authentication, payload.length);
  return `${STORAGE_PREFIX}${toBase64(sealed)}`;
}

/** Returns undefined when a sealed value was edited or cannot be decoded. */
export function openProgressStorage(value: string): unknown | undefined {
  if (!value.startsWith(STORAGE_PREFIX)) return undefined;
  try {
    const encoded = value.slice(STORAGE_PREFIX.length);
    const sealed = fromBase64(encoded);
    // Some decoders accept altered padding bits as the same bytes. Requiring
    // the canonical spelling makes every hand edit observable to the seal.
    if (toBase64(sealed) !== encoded) return undefined;
    if (sealed.length <= NONCE_BYTES + TAG_BYTES) return undefined;
    const payload = sealed.slice(0, -TAG_BYTES);
    const storedTag = sealed.slice(-TAG_BYTES);
    if (!sameBytes(storedTag, tag(payload))) return undefined;
    const nonce = payload.slice(0, NONCE_BYTES);
    const encrypted = payload.slice(NONCE_BYTES);
    const clear = crypt(encrypted, nonce);
    return JSON.parse(new TextDecoder().decode(clear)) as unknown;
  } catch {
    return undefined;
  }
}

export function isSealedProgressStorage(value: string) {
  return value.startsWith(STORAGE_PREFIX);
}
