export function uint8ToBase64(u8) {
  let binary = '';
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const u8 = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    u8[i] = binary.charCodeAt(i);
  }

  return u8;
}