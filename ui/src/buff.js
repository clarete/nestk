/** Shim for data structure not available in browser
 *
 * Not calling it `Buffer' because there was something else that shown
 * up on the namespace after babel+react were introduced.
 */
export default class Buff extends Uint8Array {
  readInt8(offset=0) {
    return this[offset];
  }
  readUInt32LE(offset=0) {
    return (this[offset]
            | this[offset + 1] << 8
            | this[offset + 2] << 16
            | this[offset + 3] << 24);
  }
}
