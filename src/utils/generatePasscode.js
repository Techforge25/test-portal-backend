function generatePasscode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let chunk = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * chars.length);
    chunk += chars[idx];
  }
  return `TF-${chunk}`;
}

module.exports = { generatePasscode };

