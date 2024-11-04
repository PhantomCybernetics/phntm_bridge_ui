(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (global){(function (){
var rosmsg2_serialization = require("@foxglove/rosmsg2-serialization");

global.window.Serialization = rosmsg2_serialization;
}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"@foxglove/rosmsg2-serialization":4}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageReader = void 0;
const cdr_1 = require("@foxglove/cdr");
class MessageReader {
    constructor(definitions) {
        const rootDefinition = definitions[0];
        if (rootDefinition == undefined) {
            throw new Error("MessageReader initialized with no root MessageDefinition");
        }
        this.rootDefinition = rootDefinition.definitions;
        this.definitions = new Map(definitions.map((def) => [def.name ?? "", def.definitions]));
    }
    // We template on R here for call site type information if the class type information T is not
    // known or available
    readMessage(buffer) {
        const reader = new cdr_1.CdrReader(buffer);
        return this.readComplexType(this.rootDefinition, reader);
    }
    readComplexType(definition, reader) {
        const msg = {};
        for (const field of definition) {
            if (field.isConstant === true) {
                continue;
            }
            if (field.isComplex === true) {
                // Complex type
                const nestedDefinition = this.definitions.get(field.type);
                if (nestedDefinition == undefined) {
                    throw new Error(`Unrecognized complex type ${field.type}`);
                }
                if (field.isArray === true) {
                    // For dynamic length arrays we need to read a uint32 prefix
                    const arrayLength = field.arrayLength ?? reader.sequenceLength();
                    const array = [];
                    for (let i = 0; i < arrayLength; i++) {
                        array.push(this.readComplexType(nestedDefinition, reader));
                    }
                    msg[field.name] = array;
                }
                else {
                    msg[field.name] = this.readComplexType(nestedDefinition, reader);
                }
            }
            else {
                // Primitive type
                if (field.isArray === true) {
                    const deser = typedArrayDeserializers.get(field.type);
                    if (deser == undefined) {
                        throw new Error(`Unrecognized primitive array type ${field.type}[]`);
                    }
                    // For dynamic length arrays we need to read a uint32 prefix
                    const arrayLength = field.arrayLength ?? reader.sequenceLength();
                    msg[field.name] = deser(reader, arrayLength);
                }
                else {
                    const deser = deserializers.get(field.type);
                    if (deser == undefined) {
                        throw new Error(`Unrecognized primitive type ${field.type}`);
                    }
                    msg[field.name] = deser(reader);
                }
            }
        }
        return msg;
    }
}
exports.MessageReader = MessageReader;
const deserializers = new Map([
    ["bool", (reader) => Boolean(reader.int8())],
    ["int8", (reader) => reader.int8()],
    ["uint8", (reader) => reader.uint8()],
    ["int16", (reader) => reader.int16()],
    ["uint16", (reader) => reader.uint16()],
    ["int32", (reader) => reader.int32()],
    ["uint32", (reader) => reader.uint32()],
    ["int64", (reader) => reader.int64()],
    ["uint64", (reader) => reader.uint64()],
    ["float32", (reader) => reader.float32()],
    ["float64", (reader) => reader.float64()],
    ["string", (reader) => reader.string()],
    ["time", (reader) => ({ sec: reader.int32(), nsec: reader.uint32() })],
    ["duration", (reader) => ({ sec: reader.int32(), nsec: reader.uint32() })],
]);
const typedArrayDeserializers = new Map([
    ["bool", readBoolArray],
    ["int8", (reader, count) => reader.int8Array(count)],
    ["uint8", (reader, count) => reader.uint8Array(count)],
    ["int16", (reader, count) => reader.int16Array(count)],
    ["uint16", (reader, count) => reader.uint16Array(count)],
    ["int32", (reader, count) => reader.int32Array(count)],
    ["uint32", (reader, count) => reader.uint32Array(count)],
    ["int64", (reader, count) => reader.int64Array(count)],
    ["uint64", (reader, count) => reader.uint64Array(count)],
    ["float32", (reader, count) => reader.float32Array(count)],
    ["float64", (reader, count) => reader.float64Array(count)],
    ["string", readStringArray],
    ["time", readTimeArray],
    ["duration", readTimeArray],
]);
function readBoolArray(reader, count) {
    const array = new Array(count);
    for (let i = 0; i < count; i++) {
        array[i] = Boolean(reader.int8());
    }
    return array;
}
function readStringArray(reader, count) {
    const array = new Array(count);
    for (let i = 0; i < count; i++) {
        array[i] = reader.string();
    }
    return array;
}
function readTimeArray(reader, count) {
    const array = new Array(count);
    for (let i = 0; i < count; i++) {
        const sec = reader.int32();
        const nsec = reader.uint32();
        array[i] = { sec, nsec };
    }
    return array;
}

},{"@foxglove/cdr":9}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageWriter = void 0;
const cdr_1 = require("@foxglove/cdr");
const PRIMITIVE_SIZES = new Map([
    ["bool", 1],
    ["int8", 1],
    ["uint8", 1],
    ["int16", 2],
    ["uint16", 2],
    ["int32", 4],
    ["uint32", 4],
    ["int64", 8],
    ["uint64", 8],
    ["float32", 4],
    ["float64", 8],
    // ["string", ...], // handled separately
    ["time", 8],
    ["duration", 8],
]);
const PRIMITIVE_WRITERS = new Map([
    ["bool", bool],
    ["int8", int8],
    ["uint8", uint8],
    ["int16", int16],
    ["uint16", uint16],
    ["int32", int32],
    ["uint32", uint32],
    ["int64", int64],
    ["uint64", uint64],
    ["float32", float32],
    ["float64", float64],
    ["string", string],
    ["time", time],
    ["duration", time],
]);
const PRIMITIVE_ARRAY_WRITERS = new Map([
    ["bool", boolArray],
    ["int8", int8Array],
    ["uint8", uint8Array],
    ["int16", int16Array],
    ["uint16", uint16Array],
    ["int32", int32Array],
    ["uint32", uint32Array],
    ["int64", int64Array],
    ["uint64", uint64Array],
    ["float32", float32Array],
    ["float64", float64Array],
    ["string", stringArray],
    ["time", timeArray],
    ["duration", timeArray],
]);
/**
 * Takes a parsed message definition and returns a message writer which
 * serializes JavaScript objects to CDR-encoded binary.
 */
class MessageWriter {
    constructor(definitions) {
        const rootDefinition = definitions[0];
        if (rootDefinition == undefined) {
            throw new Error("MessageReader initialized with no root MessageDefinition");
        }
        this.rootDefinition = rootDefinition.definitions;
        this.definitions = new Map(definitions.map((def) => [def.name ?? "", def.definitions]));
    }
    /** Calculates the byte size needed to write this message in bytes. */
    calculateByteSize(message) {
        return this.byteSize(this.rootDefinition, message, 4);
    }
    /**
     * Serializes a JavaScript object to CDR-encoded binary according to this
     * writer's message definition. If output is provided, it's byte length must
     * be equal or greater to the result of `calculateByteSize(message)`. If not
     * provided, a new Uint8Array will be allocated.
     */
    writeMessage(message, output) {
        const writer = new cdr_1.CdrWriter({
            buffer: output,
            size: output ? undefined : this.calculateByteSize(message),
        });
        this.write(this.rootDefinition, message, writer);
        return writer.data;
    }
    byteSize(definition, message, offset) {
        const messageObj = message;
        let newOffset = offset;
        for (const field of definition) {
            if (field.isConstant === true) {
                continue;
            }
            const nestedMessage = messageObj?.[field.name];
            if (field.isArray === true) {
                const arrayLength = field.arrayLength ?? fieldLength(nestedMessage);
                const dataIsArray = Array.isArray(nestedMessage) || ArrayBuffer.isView(nestedMessage);
                const dataArray = (dataIsArray ? nestedMessage : []);
                if (field.arrayLength == undefined) {
                    // uint32 array length for dynamic arrays
                    newOffset += padding(newOffset, 4);
                    newOffset += 4;
                }
                if (field.isComplex === true) {
                    // Complex type array
                    const nestedDefinition = this.getDefinition(field.type);
                    for (let i = 0; i < arrayLength; i++) {
                        const entry = (dataArray[i] ?? {});
                        newOffset = this.byteSize(nestedDefinition, entry, newOffset);
                    }
                }
                else if (field.type === "string") {
                    // String array
                    for (let i = 0; i < arrayLength; i++) {
                        const entry = (dataArray[i] ?? "");
                        newOffset += padding(newOffset, 4);
                        newOffset += 4 + entry.length + 1; // uint32 length prefix, string, null terminator
                    }
                }
                else {
                    // Primitive array
                    const entrySize = this.getPrimitiveSize(field.type);
                    const alignment = field.type === "time" || field.type === "duration" ? 4 : entrySize;
                    newOffset += padding(newOffset, alignment);
                    newOffset += entrySize * arrayLength;
                }
            }
            else {
                if (field.isComplex === true) {
                    // Complex type
                    const nestedDefinition = this.getDefinition(field.type);
                    const entry = (nestedMessage ?? {});
                    newOffset = this.byteSize(nestedDefinition, entry, newOffset);
                }
                else if (field.type === "string") {
                    // String
                    const entry = typeof nestedMessage === "string" ? nestedMessage : "";
                    newOffset += padding(newOffset, 4);
                    newOffset += 4 + entry.length + 1; // uint32 length prefix, string, null terminator
                }
                else {
                    // Primitive
                    const entrySize = this.getPrimitiveSize(field.type);
                    const alignment = field.type === "time" || field.type === "duration" ? 4 : entrySize;
                    newOffset += padding(newOffset, alignment);
                    newOffset += entrySize;
                }
            }
        }
        return newOffset;
    }
    write(definition, message, writer) {
        const messageObj = message;
        for (const field of definition) {
            if (field.isConstant === true) {
                continue;
            }
            const nestedMessage = messageObj?.[field.name];
            if (field.isArray === true) {
                const arrayLength = field.arrayLength ?? fieldLength(nestedMessage);
                const dataIsArray = Array.isArray(nestedMessage) || ArrayBuffer.isView(nestedMessage);
                const dataArray = (dataIsArray ? nestedMessage : []);
                if (field.arrayLength == undefined) {
                    // uint32 array length for dynamic arrays
                    writer.sequenceLength(arrayLength);
                }
                if (field.isComplex === true) {
                    // Complex type array
                    const nestedDefinition = this.getDefinition(field.type);
                    for (let i = 0; i < arrayLength; i++) {
                        const entry = dataArray[i] ?? {};
                        this.write(nestedDefinition, entry, writer);
                    }
                }
                else {
                    // Primitive array
                    const arrayWriter = this.getPrimitiveArrayWriter(field.type);
                    arrayWriter(nestedMessage, field.defaultValue, writer);
                }
            }
            else {
                if (field.isComplex === true) {
                    // Complex type
                    const nestedDefinition = this.getDefinition(field.type);
                    const entry = nestedMessage ?? {};
                    this.write(nestedDefinition, entry, writer);
                }
                else {
                    // Primitive
                    const primitiveWriter = this.getPrimitiveWriter(field.type);
                    primitiveWriter(nestedMessage, field.defaultValue, writer);
                }
            }
        }
    }
    getDefinition(datatype) {
        const nestedDefinition = this.definitions.get(datatype);
        if (nestedDefinition == undefined) {
            throw new Error(`Unrecognized complex type ${datatype}`);
        }
        return nestedDefinition;
    }
    getPrimitiveSize(primitiveType) {
        const size = PRIMITIVE_SIZES.get(primitiveType);
        if (size == undefined) {
            throw new Error(`Unrecognized primitive type ${primitiveType}`);
        }
        return size;
    }
    getPrimitiveWriter(primitiveType) {
        const writer = PRIMITIVE_WRITERS.get(primitiveType);
        if (writer == undefined) {
            throw new Error(`Unrecognized primitive type ${primitiveType}`);
        }
        return writer;
    }
    getPrimitiveArrayWriter(primitiveType) {
        const writer = PRIMITIVE_ARRAY_WRITERS.get(primitiveType);
        if (writer == undefined) {
            throw new Error(`Unrecognized primitive type ${primitiveType}[]`);
        }
        return writer;
    }
}
exports.MessageWriter = MessageWriter;
function fieldLength(value) {
    const length = value?.length;
    return typeof length === "number" ? length : 0;
}
function bool(value, defaultValue, writer) {
    const boolValue = typeof value === "boolean" ? value : (defaultValue ?? false);
    writer.int8(boolValue ? 1 : 0);
}
function int8(value, defaultValue, writer) {
    writer.int8(typeof value === "number" ? value : (defaultValue ?? 0));
}
function uint8(value, defaultValue, writer) {
    writer.uint8(typeof value === "number" ? value : (defaultValue ?? 0));
}
function int16(value, defaultValue, writer) {
    writer.int16(typeof value === "number" ? value : (defaultValue ?? 0));
}
function uint16(value, defaultValue, writer) {
    writer.uint16(typeof value === "number" ? value : (defaultValue ?? 0));
}
function int32(value, defaultValue, writer) {
    writer.int32(typeof value === "number" ? value : (defaultValue ?? 0));
}
function uint32(value, defaultValue, writer) {
    writer.uint32(typeof value === "number" ? value : (defaultValue ?? 0));
}
function int64(value, defaultValue, writer) {
    if (typeof value === "bigint") {
        writer.int64(value);
    }
    else if (typeof value === "number") {
        writer.int64(BigInt(value));
    }
    else {
        writer.int64((defaultValue ?? 0n));
    }
}
function uint64(value, defaultValue, writer) {
    if (typeof value === "bigint") {
        writer.uint64(value);
    }
    else if (typeof value === "number") {
        writer.uint64(BigInt(value));
    }
    else {
        writer.uint64((defaultValue ?? 0n));
    }
}
function float32(value, defaultValue, writer) {
    writer.float32(typeof value === "number" ? value : (defaultValue ?? 0));
}
function float64(value, defaultValue, writer) {
    writer.float64(typeof value === "number" ? value : (defaultValue ?? 0));
}
function string(value, defaultValue, writer) {
    writer.string(typeof value === "string" ? value : (defaultValue ?? ""));
}
function time(value, _defaultValue, writer) {
    if (value == undefined) {
        writer.int32(0);
        writer.uint32(0);
        return;
    }
    const timeObj = value;
    writer.int32(timeObj.sec ?? 0);
    writer.uint32(timeObj.nsec ?? timeObj.nanosec ?? 0);
}
function boolArray(value, defaultValue, writer) {
    if (Array.isArray(value)) {
        const array = new Int8Array(value);
        writer.int8Array(array);
    }
    else {
        writer.int8Array((defaultValue ?? []));
    }
}
function int8Array(value, defaultValue, writer) {
    if (value instanceof Int8Array) {
        writer.int8Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new Int8Array(value);
        writer.int8Array(array);
    }
    else {
        writer.int8Array((defaultValue ?? []));
    }
}
function uint8Array(value, defaultValue, writer) {
    if (value instanceof Uint8Array) {
        writer.uint8Array(value);
    }
    else if (value instanceof Uint8ClampedArray) {
        writer.uint8Array(new Uint8Array(value));
    }
    else if (Array.isArray(value)) {
        const array = new Uint8Array(value);
        writer.uint8Array(array);
    }
    else {
        writer.uint8Array((defaultValue ?? []));
    }
}
function int16Array(value, defaultValue, writer) {
    if (value instanceof Int16Array) {
        writer.int16Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new Int16Array(value);
        writer.int16Array(array);
    }
    else {
        writer.int16Array((defaultValue ?? []));
    }
}
function uint16Array(value, defaultValue, writer) {
    if (value instanceof Uint16Array) {
        writer.uint16Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new Uint16Array(value);
        writer.uint16Array(array);
    }
    else {
        writer.uint16Array((defaultValue ?? []));
    }
}
function int32Array(value, defaultValue, writer) {
    if (value instanceof Int32Array) {
        writer.int32Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new Int32Array(value);
        writer.int32Array(array);
    }
    else {
        writer.int32Array((defaultValue ?? []));
    }
}
function uint32Array(value, defaultValue, writer) {
    if (value instanceof Uint32Array) {
        writer.uint32Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new Uint32Array(value);
        writer.uint32Array(array);
    }
    else {
        writer.uint32Array((defaultValue ?? []));
    }
}
function int64Array(value, defaultValue, writer) {
    if (value instanceof BigInt64Array) {
        writer.int64Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new BigInt64Array(value);
        writer.int64Array(array);
    }
    else {
        writer.int64Array((defaultValue ?? []));
    }
}
function uint64Array(value, defaultValue, writer) {
    if (value instanceof BigUint64Array) {
        writer.uint64Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new BigUint64Array(value);
        writer.uint64Array(array);
    }
    else {
        writer.uint64Array((defaultValue ?? []));
    }
}
function float32Array(value, defaultValue, writer) {
    if (value instanceof Float32Array) {
        writer.float32Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new Float32Array(value);
        writer.float32Array(array);
    }
    else {
        writer.float32Array((defaultValue ?? []));
    }
}
function float64Array(value, defaultValue, writer) {
    if (value instanceof Float64Array) {
        writer.float64Array(value);
    }
    else if (Array.isArray(value)) {
        const array = new Float64Array(value);
        writer.float64Array(array);
    }
    else {
        writer.float64Array((defaultValue ?? []));
    }
}
function stringArray(value, defaultValue, writer) {
    if (Array.isArray(value)) {
        for (const item of value) {
            writer.string(typeof item === "string" ? item : "");
        }
    }
    else {
        const array = (defaultValue ?? []);
        for (const item of array) {
            writer.string(item);
        }
    }
}
function timeArray(value, _defaultValue, writer) {
    if (Array.isArray(value)) {
        for (const item of value) {
            time(item, undefined, writer);
        }
    }
}
function padding(offset, byteWidth) {
    // The four byte header is not considered for alignment
    const alignment = (offset - 4) % byteWidth;
    return alignment > 0 ? byteWidth - alignment : 0;
}

},{"@foxglove/cdr":9}],4:[function(require,module,exports){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./MessageReader"), exports);
__exportStar(require("./MessageWriter"), exports);

},{"./MessageReader":2,"./MessageWriter":3}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CdrReader = void 0;
const encapsulationKind_1 = require("./encapsulationKind");
const isBigEndian_1 = require("./isBigEndian");
class CdrReader {
    constructor(data) {
        this.textDecoder = new TextDecoder("utf8");
        this.hostLittleEndian = !(0, isBigEndian_1.isBigEndian)();
        if (data.byteLength < 4) {
            throw new Error(`Invalid CDR data size ${data.byteLength}, must contain at least a 4-byte header`);
        }
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const kind = this.kind;
        this.littleEndian = kind === encapsulationKind_1.EncapsulationKind.CDR_LE || kind === encapsulationKind_1.EncapsulationKind.PL_CDR_LE;
        this.offset = 4;
    }
    get kind() {
        return this.view.getUint8(1);
    }
    get decodedBytes() {
        return this.offset;
    }
    get byteLength() {
        return this.view.byteLength;
    }
    int8() {
        const value = this.view.getInt8(this.offset);
        this.offset += 1;
        return value;
    }
    uint8() {
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value;
    }
    int16() {
        this.align(2);
        const value = this.view.getInt16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
    }
    uint16() {
        this.align(2);
        const value = this.view.getUint16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
    }
    int32() {
        this.align(4);
        const value = this.view.getInt32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
    }
    uint32() {
        this.align(4);
        const value = this.view.getUint32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
    }
    int64() {
        this.align(8);
        const value = this.view.getBigInt64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
    }
    uint64() {
        this.align(8);
        const value = this.view.getBigUint64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
    }
    uint16BE() {
        this.align(2);
        const value = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return value;
    }
    uint32BE() {
        this.align(4);
        const value = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return value;
    }
    uint64BE() {
        this.align(8);
        const value = this.view.getBigUint64(this.offset, false);
        this.offset += 8;
        return value;
    }
    float32() {
        this.align(4);
        const value = this.view.getFloat32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
    }
    float64() {
        this.align(8);
        const value = this.view.getFloat64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
    }
    string() {
        const length = this.uint32();
        if (length <= 1) {
            this.offset += length;
            return "";
        }
        const data = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length - 1);
        const value = this.textDecoder.decode(data);
        this.offset += length;
        return value;
    }
    sequenceLength() {
        return this.uint32();
    }
    int8Array(count = this.sequenceLength()) {
        const array = new Int8Array(this.view.buffer, this.view.byteOffset + this.offset, count);
        this.offset += count;
        return array;
    }
    uint8Array(count = this.sequenceLength()) {
        const array = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, count);
        this.offset += count;
        return array;
    }
    int16Array(count = this.sequenceLength()) {
        return this.typedArray(Int16Array, "getInt16", count);
    }
    uint16Array(count = this.sequenceLength()) {
        return this.typedArray(Uint16Array, "getUint16", count);
    }
    int32Array(count = this.sequenceLength()) {
        return this.typedArray(Int32Array, "getInt32", count);
    }
    uint32Array(count = this.sequenceLength()) {
        return this.typedArray(Uint32Array, "getUint32", count);
    }
    int64Array(count = this.sequenceLength()) {
        return this.typedArray(BigInt64Array, "getBigInt64", count);
    }
    uint64Array(count = this.sequenceLength()) {
        return this.typedArray(BigUint64Array, "getBigUint64", count);
    }
    float32Array(count = this.sequenceLength()) {
        return this.typedArray(Float32Array, "getFloat32", count);
    }
    float64Array(count = this.sequenceLength()) {
        return this.typedArray(Float64Array, "getFloat64", count);
    }
    stringArray(count = this.sequenceLength()) {
        const output = [];
        for (let i = 0; i < count; i++) {
            output.push(this.string());
        }
        return output;
    }
    /**
     * Seek the current read pointer a number of bytes relative to the current position. Note that
     * seeking before the four-byte header is invalid
     * @param relativeOffset A positive or negative number of bytes to seek
     */
    seek(relativeOffset) {
        const newOffset = this.offset + relativeOffset;
        if (newOffset < 4 || newOffset >= this.view.byteLength) {
            throw new Error(`seek(${relativeOffset}) failed, ${newOffset} is outside the data range`);
        }
        this.offset = newOffset;
    }
    /**
     * Seek to an absolute byte position in the data. Note that seeking before the four-byte header is
     * invalid
     * @param offset An absolute byte offset in the range of [4-byteLength)
     */
    seekTo(offset) {
        if (offset < 4 || offset >= this.view.byteLength) {
            throw new Error(`seekTo(${offset}) failed, value is outside the data range`);
        }
        this.offset = offset;
    }
    align(size) {
        const alignment = (this.offset - 4) % size;
        if (alignment > 0) {
            this.offset += size - alignment;
        }
    }
    // Reads a given count of numeric values into a typed array.
    typedArray(TypedArrayConstructor, getter, count) {
        if (count === 0) {
            return new TypedArrayConstructor();
        }
        this.align(TypedArrayConstructor.BYTES_PER_ELEMENT);
        const totalOffset = this.view.byteOffset + this.offset;
        if (this.littleEndian !== this.hostLittleEndian) {
            // Slowest path
            return this.typedArraySlow(TypedArrayConstructor, getter, count);
        }
        else if (totalOffset % TypedArrayConstructor.BYTES_PER_ELEMENT === 0) {
            // Fastest path
            const array = new TypedArrayConstructor(this.view.buffer, totalOffset, count);
            this.offset += TypedArrayConstructor.BYTES_PER_ELEMENT * count;
            return array;
        }
        else {
            // Slower path
            return this.typedArrayUnaligned(TypedArrayConstructor, getter, count);
        }
    }
    typedArrayUnaligned(TypedArrayConstructor, getter, count) {
        // Benchmarks indicate for count < ~10 doing each individually is faster than copy
        if (count < 10) {
            return this.typedArraySlow(TypedArrayConstructor, getter, count);
        }
        // If the length is > 10, then doing a copy of the data to align it is faster
        // using _set_ is slightly faster than slice on the array buffer according to today's benchmarks
        const byteLength = TypedArrayConstructor.BYTES_PER_ELEMENT * count;
        const copy = new Uint8Array(byteLength);
        copy.set(new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, byteLength));
        this.offset += byteLength;
        return new TypedArrayConstructor(copy.buffer, copy.byteOffset, count);
    }
    typedArraySlow(TypedArrayConstructor, getter, count) {
        const array = new TypedArrayConstructor(count);
        let offset = this.offset;
        for (let i = 0; i < count; i++) {
            array[i] = this.view[getter](offset, this.littleEndian);
            offset += TypedArrayConstructor.BYTES_PER_ELEMENT;
        }
        this.offset = offset;
        return array;
    }
}
exports.CdrReader = CdrReader;

},{"./encapsulationKind":8,"./isBigEndian":10}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CdrSizeCalculator = void 0;
class CdrSizeCalculator {
    constructor() {
        // Two bytes for Representation Id and two bytes for Options
        this.offset = 4;
    }
    get size() {
        return this.offset;
    }
    int8() {
        return this.incrementAndReturn(1);
    }
    uint8() {
        return this.incrementAndReturn(1);
    }
    int16() {
        return this.incrementAndReturn(2);
    }
    uint16() {
        return this.incrementAndReturn(2);
    }
    int32() {
        return this.incrementAndReturn(4);
    }
    uint32() {
        return this.incrementAndReturn(4);
    }
    int64() {
        return this.incrementAndReturn(8);
    }
    uint64() {
        return this.incrementAndReturn(8);
    }
    float32() {
        return this.incrementAndReturn(4);
    }
    float64() {
        return this.incrementAndReturn(8);
    }
    string(length) {
        this.uint32();
        this.offset += length + 1; // Add one for the null terminator
        return this.offset;
    }
    sequenceLength() {
        return this.uint32();
    }
    // Increments the offset by `byteCount` and any required padding bytes and
    // returns the new offset
    incrementAndReturn(byteCount) {
        const alignment = (this.offset - 4) % byteCount;
        if (alignment > 0) {
            this.offset += byteCount - alignment;
        }
        this.offset += byteCount;
        return this.offset;
    }
}
exports.CdrSizeCalculator = CdrSizeCalculator;

},{}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CdrWriter = void 0;
const encapsulationKind_1 = require("./encapsulationKind");
const isBigEndian_1 = require("./isBigEndian");
class CdrWriter {
    constructor(options = {}) {
        this.textEncoder = new TextEncoder();
        if (options.buffer != undefined) {
            this.buffer = options.buffer;
        }
        else if (options.size != undefined) {
            this.buffer = new ArrayBuffer(options.size);
        }
        else {
            this.buffer = new ArrayBuffer(CdrWriter.DEFAULT_CAPACITY);
        }
        const kind = options.kind ?? encapsulationKind_1.EncapsulationKind.CDR_LE;
        this.littleEndian = kind === encapsulationKind_1.EncapsulationKind.CDR_LE || kind === encapsulationKind_1.EncapsulationKind.PL_CDR_LE;
        this.hostLittleEndian = !(0, isBigEndian_1.isBigEndian)();
        this.array = new Uint8Array(this.buffer);
        this.view = new DataView(this.buffer);
        // Write the Representation Id and Offset fields
        this.resizeIfNeeded(4);
        this.view.setUint8(0, 0); // Upper bits of EncapsulationKind, unused
        this.view.setUint8(1, kind);
        // The RTPS specification does not define any settings for the 2 byte
        // options field and further states that a receiver should not interpret it
        // when it reads the options field
        this.view.setUint16(2, 0, false);
        this.offset = 4;
    }
    get data() {
        return new Uint8Array(this.buffer, 0, this.offset);
    }
    get size() {
        return this.offset;
    }
    int8(value) {
        this.resizeIfNeeded(1);
        this.view.setInt8(this.offset, value);
        this.offset += 1;
        return this;
    }
    uint8(value) {
        this.resizeIfNeeded(1);
        this.view.setUint8(this.offset, value);
        this.offset += 1;
        return this;
    }
    int16(value) {
        this.align(2);
        this.view.setInt16(this.offset, value, this.littleEndian);
        this.offset += 2;
        return this;
    }
    uint16(value) {
        this.align(2);
        this.view.setUint16(this.offset, value, this.littleEndian);
        this.offset += 2;
        return this;
    }
    int32(value) {
        this.align(4);
        this.view.setInt32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
    }
    uint32(value) {
        this.align(4);
        this.view.setUint32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
    }
    int64(value) {
        this.align(8);
        this.view.setBigInt64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
    }
    uint64(value) {
        this.align(8);
        this.view.setBigUint64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
    }
    uint16BE(value) {
        this.align(2);
        this.view.setUint16(this.offset, value, false);
        this.offset += 2;
        return this;
    }
    uint32BE(value) {
        this.align(4);
        this.view.setUint32(this.offset, value, false);
        this.offset += 4;
        return this;
    }
    uint64BE(value) {
        this.align(8);
        this.view.setBigUint64(this.offset, value, false);
        this.offset += 8;
        return this;
    }
    float32(value) {
        this.align(4);
        this.view.setFloat32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
    }
    float64(value) {
        this.align(8);
        this.view.setFloat64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
    }
    string(value) {
        const strlen = value.length;
        this.uint32(strlen + 1); // Add one for the null terminator
        this.resizeIfNeeded(strlen + 1);
        this.textEncoder.encodeInto(value, new Uint8Array(this.buffer, this.offset, strlen));
        this.view.setUint8(this.offset + strlen, 0);
        this.offset += strlen + 1;
        return this;
    }
    sequenceLength(value) {
        return this.uint32(value);
    }
    int8Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        this.resizeIfNeeded(value.length);
        this.array.set(value, this.offset);
        this.offset += value.length;
        return this;
    }
    uint8Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        this.resizeIfNeeded(value.length);
        this.array.set(value, this.offset);
        this.offset += value.length;
        return this;
    }
    int16Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof Int16Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.int16(entry);
            }
        }
        return this;
    }
    uint16Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof Uint16Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.uint16(entry);
            }
        }
        return this;
    }
    int32Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof Int32Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.int32(entry);
            }
        }
        return this;
    }
    uint32Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof Uint32Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.uint32(entry);
            }
        }
        return this;
    }
    int64Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof BigInt64Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.int64(BigInt(entry));
            }
        }
        return this;
    }
    uint64Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof BigUint64Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.uint64(BigInt(entry));
            }
        }
        return this;
    }
    float32Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof Float32Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.float32(entry);
            }
        }
        return this;
    }
    float64Array(value, writeLength) {
        if (writeLength === true) {
            this.sequenceLength(value.length);
        }
        if (value instanceof Float64Array &&
            this.littleEndian === this.hostLittleEndian &&
            value.length >= CdrWriter.BUFFER_COPY_THRESHOLD) {
            this.align(value.BYTES_PER_ELEMENT, value.byteLength);
            this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
            this.offset += value.byteLength;
        }
        else {
            for (const entry of value) {
                this.float64(entry);
            }
        }
        return this;
    }
    /**
     * Calculate the capacity needed to hold the given number of aligned bytes,
     * resize if needed, and write padding bytes for alignment
     * @param size Byte width to align to. If the current offset is 1 and `size`
     *   is 4, 3 bytes of padding will be written
     * @param bytesToWrite Optional, total amount of bytes that are intended to be
     *   written directly following the alignment. This can be used to avoid
     *   additional buffer resizes in the case of writing large blocks of aligned
     *   data such as arrays
     */
    align(size, bytesToWrite = size) {
        // The four byte header is not considered for alignment
        const alignment = (this.offset - 4) % size;
        const padding = alignment > 0 ? size - alignment : 0;
        this.resizeIfNeeded(padding + bytesToWrite);
        // Write padding bytes
        this.array.fill(0, this.offset, this.offset + padding);
        this.offset += padding;
    }
    resizeIfNeeded(additionalBytes) {
        const capacity = this.offset + additionalBytes;
        if (this.buffer.byteLength < capacity) {
            const doubled = this.buffer.byteLength * 2;
            const newCapacity = doubled > capacity ? doubled : capacity;
            this.resize(newCapacity);
        }
    }
    resize(capacity) {
        if (this.buffer.byteLength >= capacity) {
            return;
        }
        const buffer = new ArrayBuffer(capacity);
        const array = new Uint8Array(buffer);
        array.set(this.array);
        this.buffer = buffer;
        this.array = array;
        this.view = new DataView(buffer);
    }
}
exports.CdrWriter = CdrWriter;
CdrWriter.DEFAULT_CAPACITY = 16;
CdrWriter.BUFFER_COPY_THRESHOLD = 10;

},{"./encapsulationKind":8,"./isBigEndian":10}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncapsulationKind = void 0;
var EncapsulationKind;
(function (EncapsulationKind) {
    EncapsulationKind[EncapsulationKind["CDR_BE"] = 0] = "CDR_BE";
    EncapsulationKind[EncapsulationKind["CDR_LE"] = 1] = "CDR_LE";
    EncapsulationKind[EncapsulationKind["PL_CDR_BE"] = 2] = "PL_CDR_BE";
    EncapsulationKind[EncapsulationKind["PL_CDR_LE"] = 3] = "PL_CDR_LE";
})(EncapsulationKind = exports.EncapsulationKind || (exports.EncapsulationKind = {}));

},{}],9:[function(require,module,exports){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./CdrReader"), exports);
__exportStar(require("./CdrSizeCalculator"), exports);
__exportStar(require("./CdrWriter"), exports);
__exportStar(require("./encapsulationKind"), exports);

},{"./CdrReader":5,"./CdrSizeCalculator":6,"./CdrWriter":7,"./encapsulationKind":8}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBigEndian = void 0;
const endianTestArray = new Uint8Array(4);
const endianTestView = new Uint32Array(endianTestArray.buffer);
endianTestView[0] = 1;
/**
 * Test if the current running system is Big Endian architecture or Little Endian.
 * @returns true on Big Endian architecture systems
 */
function isBigEndian() {
    return endianTestArray[3] === 1;
}
exports.isBigEndian = isBigEndian;

},{}]},{},[1]);
