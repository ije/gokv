// Serializing and deserializing complex JavaScript objects in structured binary format with streams support.
// These functions are slower than `JSON.stringify` and `JSON.parse`, but support more types.

enum Type {
  UNDEFINED,
  NULL,
  BOOL,
  NAN,
  INFINITY,
  INT,
  INT64,
  UINT,
  UINT64,
  FLOAT32,
  FLOAT64,
  BIGINT,
  BIGUINT,
  STRING,
  UINT8_ARRAY,
  TYPED_ARRAY,
  ARRAY_BUFFER,
  ARRAY,
  SET,
  OBJECT,
  MAP,
  DATE,
  REGEXP,
  URL,
  ERROR,
  JSON,
}

const TypedArraryTypes = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
];

class Buffer {
  #buffer = new Uint8Array(1024);
  #offset = 0;

  write(chunk: Uint8Array): Promise<void> {
    if (this.#offset + chunk.byteLength > this.#buffer.byteLength) {
      const buffer = new Uint8Array(this.#offset + chunk.byteLength + 1024);
      buffer.set(this.#buffer);
      this.#buffer = buffer;
    }
    this.#buffer.set(chunk, this.#offset);
    this.#offset += chunk.byteLength;
    return Promise.resolve();
  }

  readAll(): Uint8Array {
    return this.#buffer.slice(0, this.#offset);
  }
}

class StreamBuffer {
  #readable: ReadableStream<Uint8Array>;
  #writable: WritableStream<Uint8Array>;
  #buffer: Uint8Array;
  #offset = 0;

  constructor(bufferSize: number) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    this.#readable = readable;
    this.#writable = writable;
    this.#buffer = new Uint8Array(bufferSize);
  }

  get readable(): ReadableStream<Uint8Array> {
    return this.#readable;
  }

  async write(chunk: Uint8Array): Promise<void> {
    const bufferSize = this.#buffer.byteLength;
    if (chunk.byteLength + this.#offset > bufferSize) {
      await this.drain();
    }
    if (chunk.byteLength > bufferSize) {
      const wr = this.#writable.getWriter();
      try {
        await wr.write(chunk);
      } finally {
        wr.releaseLock();
      }
      return;
    } else {
      this.#buffer.set(chunk, this.#offset);
      this.#offset += chunk.byteLength;
    }
  }

  async drain() {
    if (this.#offset > 0) {
      const wr = this.#writable.getWriter();
      try {
        await wr.write(this.#buffer.slice(0, this.#offset));
      } finally {
        wr.releaseLock();
      }
      this.#offset = 0;
    }
  }

  async close() {
    await this.drain();
    this.#writable.getWriter().close();
  }
}

class StructuredWriter {
  #enc = new TextEncoder();
  #writer: { write(chunk: Uint8Array): Promise<void> } = new Buffer();
  #bufferView = new DataView(new ArrayBuffer(9));

  async serialize(v: unknown): Promise<Uint8Array> {
    const buffer = new Buffer();
    this.#writer = buffer;
    await this.serializeWrite(v);
    return buffer.readAll();
  }

  serializeStream(v: unknown): ReadableStream<Uint8Array> {
    const buffer = new StreamBuffer(4 * 1024);
    this.#writer = buffer;
    this.serializeWrite(v).then(() => buffer.close());
    return buffer.readable;
  }

  serializeWrite(v: unknown): Promise<void> {
    switch (typeof v) {
      case "undefined":
        return this.writeByte(Type.UNDEFINED);
      case "boolean":
        return this.writeByte(Type.BOOL, v ? 1 : 0);
      case "number": {
        if (Number.isNaN(v)) {
          return this.writeByte(Type.NAN);
        }
        if (v === Infinity) {
          return this.writeByte(Type.INFINITY);
        }
        if (Number.isInteger(v)) {
          if (v >= 2 ** 32) {
            return this.writeInt64(v);
          }
          if (v >= 0) {
            return this.writeUint(v);
          }
          if (v < -(2 ** 31)) {
            return this.writeInt64(v);
          }
          return this.writeInt(v);
        }
        if (v === Math.fround(v)) {
          return this.writeFloat32(v);
        }
        return this.writeFloat64(v);
      }
      case "bigint":
        if (v >= 0) {
          return this.writeBigUInt(v);
        }
        return this.writeBigInt(v);
      case "string":
        return this.writeString(v);
      case "object":
        if (v === null) {
          return this.writeByte(Type.NULL);
        }
        if (Array.isArray(v)) {
          return this.writeArray(v);
        }
        if (Object.getPrototypeOf(v) === Object.prototype) {
          return this.writeObject(v as Record<string, unknown>);
        }
        if (v instanceof Set) {
          return this.writeSet(v);
        }
        if (v instanceof Map) {
          return this.writeMap(v);
        }
        if (v instanceof Uint8Array) {
          return this.writeUint8Array(v);
        }
        if (v instanceof ArrayBuffer) {
          return this.writeArrayBuffer(v);
        }
        if (TypedArraryTypes.some((t) => v instanceof t)) {
          return this.writeTypedArray(v as { byteLength: number; buffer: ArrayBufferLike });
        }
        if (v instanceof Date) {
          return this.writeDate(v);
        }
        if (v instanceof RegExp) {
          return this.writeRegExp(v);
        }
        if (v instanceof URL) {
          return this.writeURL(v);
        }
        if (v instanceof Error) {
          return this.writeError(v);
        }
    }
    throw new Error(`Unsupported type: ${v}`);
  }

  write(chunk: ArrayBuffer, offset?: number, length?: number): Promise<void> {
    return this.#writer.write(new Uint8Array(chunk, offset, length));
  }

  writeByte(...a: number[]): Promise<void> {
    return this.#writer.write(new Uint8Array(a));
  }

  writeInt(v: number): Promise<void> {
    const view = this.#bufferView;

    // 1 byte for size when v >= -128 and v < 128
    if (v >= -128 && v < 128) {
      view.setUint8(0, Type.INT);
      view.setInt8(1, v);
      return this.write(view.buffer, 0, 2);
    }

    // 2 bytes for size when v >= -32768 and v < 32768 (2^15)
    // add 100 to type to indicate 2 bytes size
    if (v >= -32768 && v < 32768) {
      view.setUint8(0, Type.INT + 100);
      view.setInt16(1, v);
      return this.write(view.buffer, 0, 3);
    }

    // add 200 to type to indicate 4 bytes size
    view.setUint8(0, Type.INT + 200);
    view.setInt32(1, v);
    return this.write(view.buffer, 0, 5);
  }

  writeUint(v: number): Promise<void> {
    const view = this.#bufferView;

    // 1 byte for size when v >= 0 and v < 256
    if (v < 256) {
      view.setUint8(0, Type.UINT);
      view.setUint8(1, v);
      return this.write(view.buffer, 0, 2);
    }

    // 2 bytes for size when v >= 0 and v < 65536 (2^16)
    // add 100 to type to indicate 2 bytes size
    if (v < 65536) {
      view.setUint8(0, Type.UINT + 100);
      view.setUint16(1, v);
      return this.write(view.buffer, 0, 3);
    }

    // add 200 to type to indicate 4 bytes size
    view.setUint8(0, Type.UINT + 200);
    view.setUint32(1, v);
    return this.write(view.buffer, 0, 5);
  }

  writeInt64(v: number): Promise<void> {
    const view = this.#bufferView;
    view.setUint8(0, Type.INT64);
    view.setBigInt64(1, BigInt(v));
    return this.write(view.buffer);
  }

  writeUint64(v: number): Promise<void> {
    const view = this.#bufferView;
    view.setUint8(0, Type.UINT64);
    view.setBigInt64(1, BigInt(v));
    return this.write(view.buffer);
  }

  writeBigUInt(v: bigint): Promise<void> {
    const view = this.#bufferView;
    view.setUint8(0, Type.BIGUINT);
    view.setBigUint64(1, v);
    return this.write(view.buffer);
  }

  writeBigInt(v: bigint): Promise<void> {
    const view = this.#bufferView;
    view.setUint8(0, Type.BIGINT);
    view.setBigInt64(1, v);
    return this.write(view.buffer);
  }

  writeFloat32(v: number): Promise<void> {
    const view = this.#bufferView;
    view.setUint8(0, Type.FLOAT32);
    view.setFloat32(1, v);
    return this.write(view.buffer, 0, 5);
  }

  writeFloat64(v: number): Promise<void> {
    const view = this.#bufferView;
    view.setUint8(0, Type.FLOAT64);
    view.setFloat64(1, v);
    return this.write(view.buffer);
  }

  async writeString(v: string): Promise<void> {
    const data = this.#enc.encode(v); // use utf-8 as default
    await this.#writer.write(this.#headerBox(Type.STRING, data.byteLength));
    await this.#writer.write(data);
  }

  async writeUint8Array(v: Uint8Array): Promise<void> {
    await this.#writer.write(this.#headerBox(Type.UINT8_ARRAY, v.byteLength));
    await this.#writer.write(v);
  }

  async writeTypedArray(v: { byteLength: number; buffer: ArrayBufferLike }): Promise<void> {
    const t = TypedArraryTypes.findIndex((t) => v instanceof t);
    if (t === -1) {
      throw new Error("Unknown typed array type");
    }
    await this.#writer.write(this.#headerBox(Type.TYPED_ARRAY, v.byteLength));
    await this.writeByte(t);
    await this.#writer.write(new Uint8Array(v.buffer));
  }

  async writeArrayBuffer(v: ArrayBuffer): Promise<void> {
    await this.#writer.write(this.#headerBox(Type.ARRAY_BUFFER, v.byteLength));
    await this.#writer.write(new Uint8Array(v));
  }

  async writeJSON(v: unknown): Promise<void> {
    const json = JSON.stringify(v);
    const data = this.#enc.encode(json);
    await this.#writer.write(this.#headerBox(Type.JSON, data.byteLength));
    await this.#writer.write(data);
  }

  async writeArray(v: Array<unknown>): Promise<void> {
    const isSimple = isSimpleObject(v);
    if (this.#writer instanceof Buffer && isSimple) {
      return this.writeJSON(v);
    }
    await this.#writer.write(this.#headerBox(Type.ARRAY, v.length));
    for (const e of v) {
      if (isSimple && typeof e === "object" && e !== null) {
        await this.writeJSON(e);
      } else {
        await this.serializeWrite(e);
      }
    }
  }

  async writeObject(v: Record<string, unknown>): Promise<void> {
    if (this.#writer instanceof Buffer && isSimpleObject(v)) {
      return this.writeJSON(v);
    }
    const keys = Object.keys(v);
    await this.writeByte(Type.OBJECT);
    await this.writeJSON(keys);
    await this.writeArray(keys.map((k) => v[k]));
  }

  async writeSet(v: Set<unknown>): Promise<void> {
    const values = Array.from(v.values());
    await this.#writer.write(this.#headerBox(Type.SET, v.size));
    await this.writeArray(values);
  }

  async writeMap(v: Map<unknown, unknown>): Promise<void> {
    const entries = Array.from(v.entries());
    await this.writeByte(Type.MAP);
    await this.writeArray(entries.map(([k]) => k));
    await this.writeArray(entries.map(([, v]) => v));
  }

  writeDate(v: Date): Promise<void> {
    const view = this.#bufferView;
    view.setUint8(0, Type.DATE);
    view.setFloat64(1, v.getTime());
    return this.write(view.buffer);
  }

  async writeRegExp(v: RegExp): Promise<void> {
    await this.writeByte(Type.REGEXP);
    await this.writeString(v.source);
    await this.writeString(v.flags);
  }

  async writeURL(v: URL): Promise<void> {
    const data = this.#enc.encode(v.toString());
    await this.#writer.write(this.#headerBox(Type.URL, data.byteLength));
    await this.#writer.write(data);
  }

  async writeError(v: Error): Promise<void> {
    await this.writeByte(Type.ERROR);
    await this.writeJSON({
      name: v.name,
      message: v.message,
      stack: v.stack,
    });
  }

  #headerBox(type: Type, size: number): Uint8Array {
    const view = this.#bufferView;

    // 1 byte for size  when size < 256
    if (size < 256) {
      view.setUint8(0, type);
      view.setUint8(1, size);
      return new Uint8Array(view.buffer, 0, 2);
    }

    // 2 bytes for size when size < 65536 (2^16)
    // add 100 to type to indicate 2 bytes size
    if (size < 65536) {
      view.setUint8(0, type + 100);
      view.setUint16(1, size);
      return new Uint8Array(view.buffer, 0, 3);
    }

    // add 200 to type to indicate 4 bytes size
    view.setUint8(0, type + 200);
    view.setUint32(1, size);
    return new Uint8Array(view.buffer, 0, 5);
  }
}

class StructuredReader {
  #input: ArrayBuffer | ReadableStream<Uint8Array>;
  #dec = new TextDecoder();
  #streamBuffer = new Uint8Array(0);
  #offset = 0;

  constructor(input: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>) {
    if (input instanceof Uint8Array) {
      this.#input = input.buffer;
    } else {
      this.#input = input;
    }
  }

  async deserialize<T = unknown>(): Promise<T> {
    let type = await this.readUint8();
    let sizeMarkerBits = 1;
    if (type >= 200) {
      sizeMarkerBits = 4;
      type -= 200;
    } else if (type >= 100) {
      sizeMarkerBits = 2;
      type -= 100;
    }
    const getSizeMarker = (): Promise<number> => {
      if (sizeMarkerBits === 4) {
        return this.readUint32();
      }
      if (sizeMarkerBits === 2) {
        return this.readUint16();
      }
      return this.readUint8();
    };
    switch (type) {
      case Type.UNDEFINED: {
        return void 0 as T;
      }
      case Type.NULL: {
        return null as T;
      }
      case Type.BOOL: {
        return (await this.readUint8() === 1) as T;
      }
      case Type.NAN: {
        return NaN as T;
      }
      case Type.INFINITY: {
        return Infinity as T;
      }
      case Type.INT: {
        if (sizeMarkerBits === 4) {
          return this.readInt32() as T;
        }
        if (sizeMarkerBits === 2) {
          return this.readInt16() as T;
        }
        return this.readInt8() as T;
      }
      case Type.INT64: {
        return Number(await this.readBigInt()) as T;
      }
      case Type.UINT: {
        return getSizeMarker() as T;
      }
      case Type.UINT64: {
        return Number(await this.readBigUint()) as T;
      }
      case Type.FLOAT32: {
        return this.readFloat32() as T;
      }
      case Type.FLOAT64: {
        return this.readFloat64() as T;
      }
      case Type.BIGINT: {
        return this.readBigInt() as T;
      }
      case Type.BIGUINT: {
        return this.readBigUint() as T;
      }
      case Type.STRING: {
        const size = await getSizeMarker();
        return this.readString(size) as T;
      }
      case Type.UINT8_ARRAY: {
        const size = await getSizeMarker();
        return new Uint8Array(await this.read(size)) as T;
      }
      case Type.TYPED_ARRAY: {
        const size = await getSizeMarker();
        const t = await this.readInt8();
        const TypedArrary = TypedArraryTypes[t];
        if (!TypedArrary) {
          throw new Error("Unknown typed array type");
        }
        return new TypedArrary(await this.read(size)) as T;
      }
      case Type.ARRAY_BUFFER: {
        const size = await getSizeMarker();
        return this.read(size) as T;
      }
      case Type.JSON: {
        const size = await getSizeMarker();
        return JSON.parse(await this.readString(size)) as T;
      }
      case Type.ARRAY: {
        const arrayLen = await getSizeMarker();
        const array: unknown[] = new Array(arrayLen);
        for (let i = 0; i < arrayLen; i++) {
          array[i] = await this.deserialize();
        }
        return array as T;
      }
      case Type.OBJECT: {
        const keys = await this.deserialize<unknown[]>();
        const values = await this.deserialize<unknown[]>();
        if (!Array.isArray(values) || !Array.isArray(keys) || keys.length !== values.length) {
          throw new Error("Invalid object");
        }
        return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as T;
      }
      case Type.SET: {
        const setSize = await getSizeMarker();
        const values = await this.deserialize<unknown[]>();
        if (!Array.isArray(values) || values.length !== setSize) {
          throw new Error("Invalid set");
        }
        return new Set(values) as T;
      }
      case Type.MAP: {
        const keys = await this.deserialize<unknown[]>();
        const values = await this.deserialize<unknown[]>();
        if (!Array.isArray(values) || !Array.isArray(keys) || keys.length !== values.length) {
          throw new Error("Invalid map");
        }
        return new Map(keys.map((k, i) => [k, values[i]])) as T;
      }
      case Type.DATE: {
        return new Date(await this.readFloat64()) as T;
      }
      case Type.REGEXP: {
        const pattern = await this.deserialize<string>();
        const flags = await this.deserialize<string>();
        if (typeof pattern !== "string" || typeof flags !== "string") {
          throw new Error("Invalid regexp");
        }
        return new RegExp(pattern, flags) as T;
      }
      case Type.URL: {
        const size = await getSizeMarker();
        return new URL(await this.readString(size)) as T;
      }
      case Type.ERROR: {
        const { name, message, stack } = await this.deserialize<{ name: string; message: string; stack?: string }>();
        const TypedError = Reflect.get(globalThis, name) ?? Error;
        const error = new TypedError(message);
        error.name = name;
        error.stack = stack;
        return error as T;
      }
      default:
        throw new Error("Unknown type");
    }
  }

  async read(n: number): Promise<ArrayBuffer> {
    if (this.#input instanceof ReadableStream) {
      if (this.#streamBuffer.byteLength < n) {
        const reader = this.#input.getReader();
        while (this.#streamBuffer.byteLength < n) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const newBuffer = new Uint8Array(this.#streamBuffer.byteLength + value.byteLength);
          newBuffer.set(this.#streamBuffer);
          newBuffer.set(value, this.#streamBuffer.byteLength);
          this.#streamBuffer = newBuffer;
        }
        reader.releaseLock();
      }
      const buf = this.#streamBuffer.slice(0, n);
      this.#streamBuffer = this.#streamBuffer.slice(n);
      return buf.buffer;
    }
    const buf = this.#input.slice(this.#offset, this.#offset + n);
    if (buf.byteLength !== n) {
      throw new Error("Unexpected end of data");
    }
    this.#offset += n;
    return buf;
  }

  async readString(n: number): Promise<string> {
    return this.#dec.decode(await this.read(n));
  }

  async readInt8(): Promise<number> {
    const view = new DataView(await this.read(1));
    return view.getInt8(0);
  }

  async readInt16(): Promise<number> {
    const view = new DataView(await this.read(2));
    return view.getInt16(0);
  }

  async readInt32(): Promise<number> {
    const view = new DataView(await this.read(4));
    return view.getInt32(0);
  }

  async readUint8(): Promise<number> {
    const view = new DataView(await this.read(1));
    return view.getUint8(0);
  }

  async readUint16(): Promise<number> {
    const view = new DataView(await this.read(2));
    return view.getUint16(0);
  }

  async readUint32(): Promise<number> {
    const view = new DataView(await this.read(4));
    return view.getUint32(0);
  }

  async readFloat32(): Promise<number> {
    const view = new DataView(await this.read(4));
    return view.getFloat32(0);
  }

  async readFloat64(): Promise<number> {
    const view = new DataView(await this.read(8));
    return view.getFloat64(0);
  }

  async readBigUint(): Promise<bigint> {
    const view = new DataView(await this.read(8));
    return view.getBigUint64(0);
  }

  async readBigInt(): Promise<bigint> {
    const view = new DataView(await this.read(8));
    return view.getBigInt64(0);
  }
}

function isSimpleObject(v: unknown): boolean {
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean" || v === null) {
    return true;
  }
  if (typeof v === "object") {
    if (Array.isArray(v)) {
      return v.every(isSimpleObject);
    }
    if (Object.getPrototypeOf(v) === Object.prototype) {
      return Object.values(v!).every(isSimpleObject);
    }
  }
  return false;
}

/**
 * Serialize the value to a Uint8Array.
 * The value can be any type supported by the structured clone algorithm.
 */
export function serialize(value: unknown): Promise<Uint8Array> {
  return new StructuredWriter().serialize(value);
}

/**
 * Serialize the value to a ReadableStream.
 * The value can be any type supported by the structured clone algorithm.
 */
export function serializeStream(value: unknown): ReadableStream<Uint8Array> {
  return new StructuredWriter().serializeStream(value);
}

/** Deserialize the value from ArrayBuffer or ReadableStream. */
export function deserialize<T = unknown>(input: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>): Promise<T> {
  return new StructuredReader(input).deserialize<T>();
}
