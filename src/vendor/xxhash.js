// A WebAssembly implementation of xxHash, a fast non-cryptographic hash algorithm.
// Credit: https://github.com/jungomi/xxhash-wasm

/*
The MIT License (MIT)
Copyright © 2017 Michael Jungo

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Raw wasm: https://github.com/jungomi/xxhash-wasm/blob/01d223c3c9f079c0c9bd4267dde9f72a669ee003/src/xxhash.wasm
const wasmB64 =
  `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`;

const u32_BYTES = 4;
const u64_BYTES = 8;

// The xxh64 hash state struct:
const XXH64_STATE_SIZE_BYTES = u64_BYTES + // total_len
  u64_BYTES * 4 + // Accumulator lanes
  u64_BYTES * 4 + // Internal buffer
  u32_BYTES + // memsize
  u32_BYTES + // reserved32
  u64_BYTES; // reserved64

const defaultSeed = 0n;
const encoder = new TextEncoder();

// BigInts are arbitrary precision and signed, so to get the "correct" u64
// value from the return, we'll need to force that interpretation.
const u64Max = 2n ** 64n - 1n;
function forceUnsigned64(i) {
  return i & u64Max;
}

const initPromise = new Promise((resolve) => {
  const wasmBytes = Uint8Array.from(atob(wasmB64), (c) => c.charCodeAt(0));
  WebAssembly.instantiate(wasmBytes).then((i) => resolve(i.instance.exports));
});

export async function create64(seed = defaultSeed) {
  const {
    mem,
    init64,
    update64,
    digest64,
  } = await initPromise;

  let memory = new Uint8Array(mem.buffer);
  // Grow the wasm linear memory to accommodate length + offset bytes
  function growMemory(length, offset) {
    if (mem.buffer.byteLength < length + offset) {
      const extraPages = Math.ceil(
        // Wasm pages are spec'd to 64K
        (length + offset - mem.buffer.byteLength) / (64 * 1024),
      );
      mem.grow(extraPages);
      // After growing, the original memory's ArrayBuffer is detached, so we'll
      // need to replace our view over it with a new one over the new backing
      // ArrayBuffer.
      memory = new Uint8Array(mem.buffer);
    }
  }

  // The h32 and h64 streaming hash APIs are identical, so we can implement
  // them both by way of a templated call to this generalized function.
  function create(size, seed, init, update, digest, finalize) {
    // Ensure that we've actually got enough space in the wasm memory to store
    // the state blob for this hasher.
    growMemory(size);

    // We'll hold our hashing state in this closure.
    const state = new Uint8Array(size);
    memory.set(state);
    init(0, seed);

    // Each time we interact with wasm, it may have mutated our state so we'll
    // need to read it back into our closed copy.
    state.set(memory.slice(0, size));

    return {
      /**
       * Update the hash with the given data.
       * @param {Uint8Array} input
       */
      update(input) {
        memory.set(state);
        let length;
        if (typeof input === "string") {
          growMemory(input.length * 3, size);
          length = encoder.encodeInto(input, memory.subarray(size)).written;
        } else {
          // The only other valid input type is a Uint8Array
          growMemory(input.byteLength, size);
          memory.set(input, size);
          length = input.byteLength;
        }
        update(0, size, length);
        state.set(memory.slice(0, size));
        return this;
      },
      /**
       * Returns the hash as a BigInt.
       * @return {BigInt} The 64-bit hash value.
       */
      digest() {
        memory.set(state);
        return finalize(digest(0));
      },
    };
  }

  return create(
    XXH64_STATE_SIZE_BYTES,
    seed,
    init64,
    update64,
    digest64,
    forceUnsigned64,
  );
}

/**
 * Returns the 64-bit hash of the given input.
 * @param {ReadableStream} input
 * @param {bigint} seed
 * @return {Promise<bigint>}
 */
export default async function xxhash(input, seed = defaultSeed) {
  const h = await create64(seed);
  const reader = input.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      h.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return h.digest();
}
