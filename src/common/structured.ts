enum Type {
  UNDEFINED = 0x0,
  NULL = 0x1,
  BOOL = 0x2,
  NAN = 0x3,
  INFINITY = 0x4,
  INT = 0x5,
  UINT = 0x6,
  FLOAT32 = 0x7,
  FLOAT64 = 0x8,
  BIGINT = 0x9,
  BIGUINT = 0xA,
  STRING = 0xB,
  UINT8_ARRAY = 0xC,
  TYPED_ARRAY = 0xD,
  ARRAY_BUFFER = 0xE,
  ARRAY = 0xF,
  SET = 0x10,
  OBJECT = 0x11,
  MAP = 0x12,
  DATE = 0x13,
  REGEXP = 0x14,
  URL = 0x15,
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

class StructuredWriter {
  buffer = new Uint8Array(1024);
  offset = 0;

  serialize(v: unknown): Uint8Array {
    this.serializeWrite(v);
    return this.buffer.slice(0, this.offset);
  }

  serializeWrite(v: unknown): void {
    if (v === undefined) {
      this.writeByte(Type.UNDEFINED);
    } else if (v === null) {
      this.writeByte(Type.NULL);
    } else if (typeof v === "boolean") {
      this.writeByte(Type.BOOL, v ? 1 : 0);
    } else if (typeof v === "number") {
      if (Number.isNaN(v)) {
        this.writeByte(Type.NAN);
      } else if (v === Infinity) {
        this.writeByte(Type.INFINITY);
      } else if (Number.isInteger(v)) {
        if (v >= 0) {
          this.writeUInt(v);
        } else {
          this.writeInt(v);
        }
      } else if (v === Math.fround(v)) {
        this.writeFloat32(v);
      } else {
        this.writeFloat64(v);
      }
    } else if (typeof v === "bigint") {
      if (v >= 0) {
        this.writeBigUInt(v);
      } else {
        this.writeBigInt(v);
      }
    } else if (typeof v === "string") {
      this.writeString(v);
    } else if (v instanceof Uint8Array) {
      this.writeUint8Array(v);
    } else if (v instanceof ArrayBuffer) {
      this.writeArrayBuffer(v);
    } else if (TypedArraryTypes.some((t) => v instanceof t)) {
      this.writeTypedArray(v as { byteLength: number; buffer: ArrayBufferLike });
    } else if (v instanceof Set) {
      this.writeSet(v);
    } else if (Array.isArray(v)) {
      this.writeArray(v);
    } else if (typeof v === "object") {
      if (v instanceof Date) {
        this.writeDate(v);
      } else if (v instanceof RegExp) {
        this.writeRegExp(v);
      } else if (v instanceof URL) {
        this.writeURL(v);
      } else if (v instanceof Map) {
        this.writeMap(v);
      } else if (Object.getPrototypeOf(v) === Object.prototype) {
        this.writeObject(v as Record<string, unknown>);
      } else {
        throw new Error(`Unsupported type: ${v}`);
      }
    } else {
      throw new Error(`Unsupported type: ${v}`);
    }
  }

  write(chunk: Uint8Array): void {
    if (this.offset + chunk.byteLength > this.buffer.byteLength) {
      const newBuffer = new Uint8Array(this.offset + chunk.byteLength);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
    }
    this.buffer.set(chunk, this.offset);
    this.offset += chunk.byteLength;
  }

  writeByte(...a: number[]): void {
    this.write(new Uint8Array(a));
  }

  writeUInt(v: number): void {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);

    // 1 byte for size when v >= 0 and v < 256
    if (v < 256) {
      buf[0] = Type.UINT;
      view.setUint8(1, v);
      this.write(buf.slice(0, 2));
      return;
    }

    // 2 bytes for size when v >= 0 and v < 65536 (2^16)
    // add 100 to type to indicate 2 bytes size
    if (v < 65536) {
      buf[0] = Type.UINT + 100;
      view.setUint16(1, v);
      this.write(buf.slice(0, 3));
      return;
    }

    // add 200 to type to indicate 4 bytes size
    buf[0] = Type.UINT + 200;
    view.setUint32(1, v);
    this.write(buf);
  }

  writeInt(v: number): void {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);

    // 1 byte for size when v >= -128 and v < 128
    if (v >= -128 && v < 128) {
      buf[0] = Type.INT;
      view.setInt8(1, v);
      this.write(buf.slice(0, 2));
      return;
    }

    // 2 bytes for size when v >= -32768 and v < 32768 (2^15)
    // add 100 to type to indicate 2 bytes size
    if (v >= -32768 && v < 32768) {
      buf[0] = Type.INT + 100;
      view.setInt16(1, v);
      this.write(buf.slice(0, 3));
      return;
    }

    // add 200 to type to indicate 4 bytes size
    buf[0] = Type.INT + 200;
    view.setInt32(1, v);
    this.write(buf);
  }

  writeBigUInt(v: bigint): void {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.BIGUINT;
    view.setBigUint64(1, v);
    this.write(buf);
  }

  writeBigInt(v: bigint): void {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.BIGINT;
    view.setBigInt64(1, v);
    this.write(buf);
  }

  writeFloat32(v: number): void {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    buf[0] = Type.FLOAT32;
    view.setFloat32(1, v);
    this.write(buf);
  }

  writeFloat64(v: number): void {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = Type.FLOAT64;
    view.setFloat64(1, v);
    this.write(buf);
  }

  headerBox(type: Type, size: number): Uint8Array {
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

  writeString(v: string): void {
    const enc = new TextEncoder(); // use utf-8 as default
    const data = enc.encode(v);
    this.write(this.headerBox(Type.STRING, data.byteLength));
    this.write(data);
  }

  writeUint8Array(v: Uint8Array): void {
    this.write(this.headerBox(Type.UINT8_ARRAY, v.byteLength));
    this.write(v);
  }

  writeTypedArray(v: { byteLength: number; buffer: ArrayBufferLike }): void {
    const t = TypedArraryTypes.findIndex((t) => v instanceof t);
    if (t === -1) {
      throw new Error("Unknown typed array type");
    }
    this.write(this.headerBox(Type.TYPED_ARRAY, v.byteLength));
    this.writeByte(t);
    this.write(new Uint8Array(v.buffer));
  }

  writeArrayBuffer(v: ArrayBuffer): void {
    this.write(this.headerBox(Type.ARRAY_BUFFER, v.byteLength));
    this.write(new Uint8Array(v));
  }

  writeArray(v: Array<unknown>): void {
    const arrayData = v.map((v) => new StructuredWriter().serialize(v));
    this.write(this.headerBox(Type.ARRAY, v.length));
    arrayData.forEach((d) => this.write(d));
  }

  writeSet(v: Set<unknown>): void {
    const setData = Array.from(v).map((v) => new StructuredWriter().serialize(v));
    this.write(this.headerBox(Type.SET, v.size));
    setData.forEach((d) => this.write(d));
  }

  writeObject(v: Record<string, unknown>): void {
    const keys = Object.keys(v);
    this.writeByte(Type.OBJECT);
    this.write(new StructuredWriter().serialize(keys));
    this.write(new StructuredWriter().serialize(keys.map((k) => v[k])));
  }

  writeMap(v: Map<unknown, unknown>): void {
    const entries = Array.from(v.entries());
    const keysData = new StructuredWriter().serialize(entries.map(([k]) => k));
    const valuesData = new StructuredWriter().serialize(entries.map(([, v]) => v));
    this.writeByte(Type.MAP);
    this.write(keysData);
    this.write(valuesData);
  }

  writeDate(v: Date): void {
    const header = new Uint8Array(9);
    const view = new DataView(header.buffer);
    header[0] = Type.DATE;
    view.setFloat64(1, v.getTime());
    this.write(header);
  }

  writeRegExp(v: RegExp): void {
    this.writeByte(Type.REGEXP);
    this.write(new StructuredWriter().serialize([v.source, v.flags]));
  }

  writeURL(v: URL): void {
    const enc = new TextEncoder();
    const data = enc.encode(v.toString());
    this.write(this.headerBox(Type.URL, data.byteLength));
    this.write(data);
  }
}

class StructuredReader {
  view: DataView;
  offset = 0;

  constructor(data: ArrayBuffer) {
    this.view = new DataView(data);
  }

  clone(): StructuredReader {
    const reader = new StructuredReader(this.view.buffer);
    reader.offset = this.offset;
    return reader;
  }

  // deno-lint-ignore no-explicit-any
  deserialize<T = any>(): T {
    let type = this.readUint8();
    let sizeMarkerBits = 1;
    if (type >= 200) {
      sizeMarkerBits = 4;
      type -= 200;
    } else if (type >= 100) {
      sizeMarkerBits = 2;
      type -= 100;
    }
    const getSizeMarker = (): number => {
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
        return (this.readUint8() === 1) as T;
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
      case Type.UINT: {
        return getSizeMarker() as T;
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
        const size = getSizeMarker();
        return new TextDecoder().decode(this.read(size)) as T;
      }
      case Type.UINT8_ARRAY: {
        const size = getSizeMarker();
        return new Uint8Array(this.read(size)) as T;
      }
      case Type.TYPED_ARRAY: {
        const size = getSizeMarker();
        const t = this.readInt8();
        const TypedArrary = TypedArraryTypes[t];
        if (!TypedArrary) {
          throw new Error("Unknown typed array type");
        }
        return new TypedArrary(this.read(size)) as T;
      }
      case Type.ARRAY_BUFFER: {
        const size = getSizeMarker();
        return this.read(size) as T;
      }
      case Type.ARRAY: {
        const arrayLen = getSizeMarker();
        const array: unknown[] = new Array(arrayLen);
        for (let i = 0; i < arrayLen; i++) {
          array[i] = this.deserialize();
        }
        return array as T;
      }
      case Type.SET: {
        const setSize = getSizeMarker();
        const set = new Set();
        for (let i = 0; i < setSize; i++) {
          set.add(this.deserialize());
        }
        return set as T;
      }
      case Type.OBJECT: {
        const keys = this.deserialize<unknown[]>();
        const values = this.deserialize<unknown[]>();
        if (!Array.isArray(values) || !Array.isArray(keys) || keys.length !== values.length) {
          throw new Error("Invalid object");
        }
        return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as T;
      }
      case Type.MAP: {
        const keys = this.deserialize<unknown[]>();
        const values = this.deserialize<unknown[]>();
        if (!Array.isArray(values) || !Array.isArray(keys) || keys.length !== values.length) {
          throw new Error("Invalid map");
        }
        return new Map(keys.map((k, i) => [k, values[i]])) as T;
      }
      case Type.DATE: {
        return new Date(this.readFloat64()) as T;
      }
      case Type.REGEXP: {
        const pattern = this.deserialize<[string, string]>();
        if (!Array.isArray(pattern) || pattern.length !== 2) {
          throw new Error("Invalid regexp");
        }
        return new RegExp(...pattern) as T;
      }
      case Type.URL: {
        const size = getSizeMarker();
        return new URL(new TextDecoder().decode(this.read(size))) as T;
      }
      default:
        throw new Error("Unknown type");
    }
  }

  read(n: number): ArrayBuffer {
    const buf = this.view!.buffer.slice(this.offset, this.offset + n);
    if (buf.byteLength !== n) {
      throw new Error("Unexpected end of data");
    }
    this.offset += n;
    return buf;
  }

  readInt8(): number {
    const v = this.view!.getInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readInt16(): number {
    const v = this.view!.getInt16(this.offset);
    this.offset += 2;
    return v;
  }

  readInt32(): number {
    const v = this.view!.getInt32(this.offset);
    this.offset += 4;
    return v;
  }

  readUint8(): number {
    const v = this.view!.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  readUint16(): number {
    const v = this.view!.getUint16(this.offset);
    this.offset += 2;
    return v;
  }

  readUint32(): number {
    const v = this.view!.getUint32(this.offset);
    this.offset += 4;
    return v;
  }

  readFloat32(): number {
    const v = this.view!.getFloat32(this.offset);
    this.offset += 4;
    return v;
  }

  readFloat64(): number {
    const v = this.view!.getFloat64(this.offset);
    this.offset += 8;
    return v;
  }

  readBigUint(): bigint {
    const v = this.view!.getBigUint64(this.offset);
    this.offset += 8;
    return v;
  }

  readBigInt(): bigint {
    const v = this.view!.getBigInt64(this.offset);
    this.offset += 8;
    return v;
  }
}

export function serialize(v: unknown): Uint8Array {
  return new StructuredWriter().serialize(v);
}

// deno-lint-ignore no-explicit-any
export function deserialize<T = any>(buffer: ArrayBuffer): T {
  return new StructuredReader(buffer).deserialize();
}
