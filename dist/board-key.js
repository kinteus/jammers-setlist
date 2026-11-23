// SHA-1 in plain JavaScript, so the board key works the same in browsers and on servers without node:crypto.
// It is only a fingerprint for spotting board changes, not a security measure.
function utf8Bytes(text) {
    const bytes = [];
    for (let index = 0; index < text.length; index++) {
        let code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
            const next = text.charCodeAt(index + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                index++;
            }
        }
        if (code >= 0xd800 && code <= 0xdfff)
            code = 0xfffd; // a lone surrogate, as TextEncoder writes it
        if (code < 0x80)
            bytes.push(code);
        else if (code < 0x800)
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
        else if (code < 0x10000)
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        else
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
    return bytes;
}
const rotate = (value, bits) => (value << bits) | (value >>> (32 - bits));
// Lowercase hex SHA-1 of the text's UTF-8 bytes.
export function sha1Hex(text) {
    const bytes = utf8Bytes(text);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56)
        bytes.push(0);
    const high = Math.floor(bitLength / 2 ** 32);
    for (const word of [high, bitLength >>> 0])
        bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const w = new Array(80);
    for (let block = 0; block < bytes.length; block += 64) {
        for (let t = 0; t < 16; t++) {
            const at = block + t * 4;
            w[t] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
        }
        for (let t = 16; t < 80; t++)
            w[t] = rotate(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
        let [a, b, c, d, e] = state;
        for (let t = 0; t < 80; t++) {
            const [f, k] = t < 20 ? [(b & c) | (~b & d), 0x5a827999] : t < 40 ? [b ^ c ^ d, 0x6ed9eba1] : t < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
            const next = (rotate(a, 5) + f + e + k + w[t]) | 0;
            e = d;
            d = c;
            c = rotate(b, 30);
            b = a;
            a = next;
        }
        state[0] = (state[0] + a) | 0;
        state[1] = (state[1] + b) | 0;
        state[2] = (state[2] + c) | 0;
        state[3] = (state[3] + d) | 0;
        state[4] = (state[4] + e) | 0;
    }
    return state.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}
