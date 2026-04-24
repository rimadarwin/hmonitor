/**
 * Costruisce l'header Authorization per VT1 (Bearer o Basic).
 * @param {Record<string, string>} local Risultato di chrome.storage.local.get
 * @returns {{ ok: true, value: string } | { ok: false, message: string }}
 */
function buildVt1AuthorizationHeader(local) {
  const scheme = String(local.vt1AuthScheme || "bearer").toLowerCase();
  const legacy = (local.vt1Authorization || "").trim();

  if (scheme === "basic") {
    const user = (local.vt1BasicUser || "").trim();
    const pass = local.vt1BasicPassword || "";
    if (!user) {
      return { ok: false, message: "Inserisci lo username Basic nelle impostazioni." };
    }
    const raw = `${user}:${pass}`;
    const bytes = new TextEncoder().encode(raw);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return { ok: true, value: "Basic " + btoa(binary) };
  }

  const token = (local.vt1BearerToken || "").trim();
  const clean = token.replace(/^Bearer\s+/i, "").trim();
  if (clean) {
    return { ok: true, value: "Bearer " + clean };
  }

  if (legacy) {
    if (/^(Bearer|Basic)\s+/i.test(legacy)) {
      return { ok: true, value: legacy };
    }
    return { ok: true, value: "Bearer " + legacy };
  }

  return { ok: false, message: "Configura Bearer o Basic nelle impostazioni." };
}
