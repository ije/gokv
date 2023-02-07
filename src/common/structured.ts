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
  #buffer = new Uint8Array();
  #offset = 0;

  write(chunk: Uint8Array): Promise<void> {
    if (this.#offset + chunk.byteLength > this.#buffer.byteLength) {
      const newBuffer = new Uint8Array(this.#offset + chunk.byteLength);
      newBuffer.set(this.#buffer);
      this.#buffer = newBuffer;
    }
    this.#buffer.set(chunk, this.#offset);
    this.#offset += chunk.byteLength;
    return Promise.resolve();
  }

  readAll(): Uint8Array {
    return this.#buffer.slice(0, this.#offset);
  }
}

class StructuredWriter {
  #writer: { write(chunk: Uint8Array): Promise<void> } = new Buffer();

  async serialize(v: unknown): Promise<Uint8Array> {
    const buffer = new Buffer();
    this.#writer = buffer;
    await this.serializeWrite(v);
    return buffer.readAll();
  }

  serializeStream(v: unknown): ReadableStream<Uint8Array> {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.#writer = writer;
    this.serializeWrite(v).then(() => writer.close());
    return readable;
  }

  serializeWrite(v: unknown): Promise<void> {
    if (v === undefined) {
      return this.writeByte(Type.UNDEFINED);
    }

    if (v === null) {
      return this.writeByte(Type.NULL);
    }

    if (typeof v === "boolean") {
      return this.writeByte(Type.BOOL, v ? 1 : 0);
    }

    if (typeof v === "number") {
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

    if (typeof v === "bigint") {
      if (v >= 0) {
        return this.writeBigUInt(v);
      }
      return this.writeBigInt(v);
    }

    if (typeof v === "string") {
      return this.writeString(v);
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

    if (v instanceof Set) {
      return this.writeSet(v);
    }

    if (Array.isArray(v)) {
      return this.writeArray(v);
    }

    if (typeof v === "object") {
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
      if (v instanceof Map) {
        return this.writeMap(v);
      }
      if (Object.getPrototypeOf(v) === Object.prototype) {
        return this.writeObject(v as Record<string, unknown>);
      }
    }

    throw new Error(`Unsupported type: ${v}`);
  }

  write(chunk: Uint8Array): Promise<void> {
    return this.#writer.write(chunk);
  }

  writeByte(...a: number[]): Promise<void> {
    return this.write(new Uint8Array(a));
  }

  writeInt(v: number): Promise<void> {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);

    // 1 byte for size when v >= -128 and v < 128
    if (v >= -128 && v < 128) {
      buf[0] = Type.INT;
      view.setInt8(1, v);
      return this.write(buf.slice(0, 2));
    }

    // 2 bytes for size when v >= -32768 and v < 32768 (2^15)
    // add 100 to type to indicate 2 bytes size
    if (v >= -32768 && v < 32768) {
      buf[0] = Type.INT + 100;
      view.setInt16(1, v);
      return this.write(buf.slice(0, 3));
    }

    // add 200 to type to indicate 4 bytes size
    buf[0] = Type.INT + 200;
    view.setInt32(1, v);
    return this.write(buf);
  }

  writeInt64(v: number): Promise<void> {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.INT64;
    view.setBigInt64(1, BigInt(v));
    return this.write(buf);
  }

  writeUint(v: number): Promise<void> {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);

    // 1 byte for size when v >= 0 and v < 256
    if (v < 256) {
      buf[0] = Type.UINT;
      view.setUint8(1, v);
      return this.write(buf.slice(0, 2));
    }

    // 2 bytes for size when v >= 0 and v < 65536 (2^16)
    // add 100 to type to indicate 2 bytes size
    if (v < 65536) {
      buf[0] = Type.UINT + 100;
      view.setUint16(1, v);
      return this.write(buf.slice(0, 3));
    }

    // add 200 to type to indicate 4 bytes size
    buf[0] = Type.UINT + 200;
    view.setUint32(1, v);
    return this.write(buf);
  }

  writeUint64(v: number): Promise<void> {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.UINT64;
    view.setBigUint64(1, BigInt(v));
    return this.write(buf);
  }

  writeBigUInt(v: bigint): Promise<void> {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.BIGUINT;
    view.setBigUint64(1, v);
    return this.write(buf);
  }

  writeBigInt(v: bigint): Promise<void> {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.BIGINT;
    view.setBigInt64(1, v);
    return this.write(buf);
  }

  writeFloat32(v: number): Promise<void> {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    buf[0] = Type.FLOAT32;
    view.setFloat32(1, v);
    return this.write(buf);
  }

  writeFloat64(v: number): Promise<void> {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.FLOAT64;
    view.setFloat64(1, v);
    return this.write(buf);
  }

  async writeString(v: string): Promise<void> {
    const data = new TextEncoder().encode(v); // use utf-8 as default
    await this.write(this.#headerBox(Type.STRING, data.byteLength));
    await this.write(data);
  }

  async writeUint8Array(v: Uint8Array): Promise<void> {
    await this.write(this.#headerBox(Type.UINT8_ARRAY, v.byteLength));
    await this.write(v);
  }

  async writeTypedArray(v: { byteLength: number; buffer: ArrayBufferLike }): Promise<void> {
    const t = TypedArraryTypes.findIndex((t) => v instanceof t);
    if (t === -1) {
      throw new Error("Unknown typed array type");
    }
    await this.write(this.#headerBox(Type.TYPED_ARRAY, v.byteLength));
    await this.writeByte(t);
    await this.write(new Uint8Array(v.buffer));
  }

  async writeArrayBuffer(v: ArrayBuffer): Promise<void> {
    await this.write(this.#headerBox(Type.ARRAY_BUFFER, v.byteLength));
    await this.write(new Uint8Array(v));
  }

  async writeArray(v: Array<unknown>): Promise<void> {
    await this.write(this.#headerBox(Type.ARRAY, v.length));
    for (const e of v) {
      await this.serializeWrite(e);
    }
  }

  async writeSet(v: Set<unknown>): Promise<void> {
    await this.write(this.#headerBox(Type.SET, v.size));
    for (const e of v) {
      await this.serializeWrite(e);
    }
  }

  async writeObject(v: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(v);
    await this.writeByte(Type.OBJECT);
    await this.serializeWrite(keys);
    await this.serializeWrite(keys.map((k) => v[k]));
  }

  async writeMap(v: Map<unknown, unknown>): Promise<void> {
    const entries = Array.from(v.entries());
    await this.writeByte(Type.MAP);
    await this.serializeWrite(entries.map(([k]) => k));
    await this.serializeWrite(entries.map(([, v]) => v));
  }

  writeDate(v: Date): Promise<void> {
    const header = new Uint8Array(9);
    const view = new DataView(header.buffer);
    header[0] = Type.DATE;
    view.setFloat64(1, v.getTime());
    return this.write(header);
  }

  async writeRegExp(v: RegExp): Promise<void> {
    await this.writeByte(Type.REGEXP);
    await this.serializeWrite([v.source, v.flags]);
  }

  async writeURL(v: URL): Promise<void> {
    const data = new TextEncoder().encode(v.toString());
    await this.write(this.#headerBox(Type.URL, data.byteLength));
    await this.write(data);
  }

  async writeError(v: Error): Promise<void> {
    await this.writeByte(Type.ERROR);
    await this.serializeWrite({
      name: v.name,
      message: v.message,
      stack: v.stack,
    });
  }

  #headerBox(type: Type, size: number): Uint8Array {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);

    // 1 byte for size  when size < 256
    if (size < 256) {
      buf[0] = type;
      view.setUint8(1, size);
      return buf.slice(0, 2);
    }

    // 2 bytes for size when size < 65536 (2^16)
    // add 100 to type to indicate 2 bytes size
    if (size < 65536) {
      buf[0] = type + 100;
      view.setUint16(1, size);
      return buf.slice(0, 3);
    }

    // add 200 to type to indicate 4 bytes size
    buf[0] = type + 200;
    view.setUint32(1, size);
    return buf;
  }
}

class StructuredReader {
  #input: ArrayBuffer | ReadableStream<Uint8Array>;
  #streamBuffer = new Uint8Array(0);
  #offset = 0;

  constructor(input: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>) {
    if (input instanceof Uint8Array) {
      this.#input = input.buffer;
    } else {
      this.#input = input;
    }
  }

  // deno-lint-ignore no-explicit-any
  async deserialize<T = any>(): Promise<T> {
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
      case Type.ARRAY: {
        const arrayLen = await getSizeMarker();
        const array: unknown[] = new Array(arrayLen);
        for (let i = 0; i < arrayLen; i++) {
          array[i] = await this.deserialize();
        }
        return array as T;
      }
      case Type.SET: {
        const setSize = await getSizeMarker();
        const set = new Set();
        for (let i = 0; i < setSize; i++) {
          set.add(await this.deserialize());
        }
        return set as T;
      }
      case Type.OBJECT: {
        const keys = await this.deserialize<unknown[]>();
        const values = await this.deserialize<unknown[]>();
        if (!Array.isArray(values) || !Array.isArray(keys) || keys.length !== values.length) {
          throw new Error("Invalid object");
        }
        return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as T;
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
        const pattern = await this.deserialize<[string, string]>();
        if (!Array.isArray(pattern) || pattern.length !== 2) {
          throw new Error("Invalid regexp");
        }
        return new RegExp(...pattern) as T;
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
    return new TextDecoder().decode(await this.read(n));
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

export function serialize(v: unknown): Promise<Uint8Array> {
  return new StructuredWriter().serialize(v);
}

export function serializeStream(v: unknown): ReadableStream<Uint8Array> {
  return new StructuredWriter().serializeStream(v);
}

// deno-lint-ignore no-explicit-any
export function deserialize<T = any>(input: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>): Promise<T> {
  return new StructuredReader(input).deserialize();
}
