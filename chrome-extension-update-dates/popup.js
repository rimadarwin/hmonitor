/**
 * @author MG
 * @description Popup/side panel: date, switch ATOA/FILE, flussi Heroku con populate da amc.request
 * @modified 29.09.2026 - MG | ES1 150 → inboundFileFlow, payload CSV S01.0150
 * @modified 29.09.2026 - MG | ES1 100 → inboundFileFlow, payload CSV campi numerici
 * @modified 29.09.2026 - MG | ES1 ACK: URL da base Heroku, correlation_id da /dlsii-ack-context
 * @modified 29.09.2026 - MG | Flusso ELE ES1 ACK (POST /dlsii/ackFileFlow, recovery 0050)
 * @modified 29.09.2026 - MG | Flusso GAS VTG 150 (inboundflow, evento 09T)
 * @modified 28.09.2026 - MG | Sync automatico input → corpo JSON su tutti i flussi
 * @modified 28.09.2026 - MG | Flussi ELE ES1 100 e ELE ES1 150 (inboundflow, struttura righe)
 * @modified 28.09.2026 - MG | Scrape CF/P.IVA/Codice Pratica SII con alias etichette UI
 * @modified 24.09.2026 - MG | Schermata Mockup CP1 (load/update simulatore_risposta_campi)
 * @modified 23.09.2026 - MG | Schermata Riporta in sospeso (POST /riporta-sospeso)
 * @modified 23.09.2026 - MG | Populate flussi da amc.request (id_request + input) invece dello scrape
 */
/** Base API senza :porta su Render (HTTPS = 443). Per locale usa Impostazioni → 127.0.0.1:8765. */
const DEFAULT_API = "https://hmonitor-uhk9.onrender.com";
const DEFAULT_HEROKU_BASE =
  "https://gh-manage-co-dev-int-a0c1c0ddf5f3.herokuapp.com";
/** Path fissi per flusso (base URL da Impostazioni). */
const PATH_DLSII_INBOUND = "/dlsii/inboundflow";
const PATH_DLSII_INBOUND_FILE = "/dlsii/inboundFileFlow";
const PATH_DLSII_ACK_FILE = "/dlsii/ackFileFlow";
const PATH_SEND_ESITI = "/managecomunication/send-esiti";
const PATH_BATCH_INVOKE = "/batch/invoke";

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Data odierna DD/MM/YYYY (SG1 DTMS). */
function todayDDMMYYYY() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

/** Mese corrente MM/YYYY (SG1 DTMS Z_MESE_SWITCH). */
function todayMMYYYY() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${m}/${y}`;
}

/**
 * Converte testo letto dalla pagina (o digitato) in AAAAMMGG per EXT_DT_DECOR_D.
 * Accetta già AAAAMMGG, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD e altre stringhe parseabili.
 */
function normalizeDateToYYYYMMDD(raw) {
  const s = (raw == null ? "" : String(raw))
    .trim()
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const compact = s.replace(/\s/g, "");
  if (/^\d{8}$/.test(compact)) {
    const y = parseInt(compact.slice(0, 4), 10);
    const m = parseInt(compact.slice(4, 6), 10);
    const d = parseInt(compact.slice(6, 8), 10);
    if (y >= 1990 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return compact;
    }
  }
  const dmY = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmY) {
    const d = parseInt(dmY[1], 10);
    const m = parseInt(dmY[2], 10);
    const y = parseInt(dmY[3], 10);
    return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  }
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  }
  const ts = Date.parse(s);
  if (!Number.isNaN(ts)) {
    const dt = new Date(ts);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const day = String(dt.getDate()).padStart(2, "0");
      return `${y}${m}${day}`;
    }
  }
  return "";
}

/** Stato fisso API; data in formato AAAAMMGG. */
function normalizeWp1PayloadFields(payload) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  for (const row of fields) {
    if (row.field === "EXT_STATO_RICHIESTA") {
      row.value = "1";
    } else if (row.field === "EXT_DT_DECOR_D") {
      const n = normalizeDateToYYYYMMDD(row.value);
      row.value = n || todayYYYYMMDD();
    }
  }
  return p;
}

async function getApiBase() {
  const { apiBaseUrl } = await chrome.storage.sync.get({
    apiBaseUrl: DEFAULT_API,
  });
  return (apiBaseUrl || DEFAULT_API).replace(/\/+$/, "");
}

function normalizeHerokuBase(raw) {
  let u = (raw || "").trim().replace(/\/+$/, "");
  if (!u) return DEFAULT_HEROKU_BASE;
  u = u.replace(/\/dlsii\/inboundflow\/?$/i, "");
  u = u.replace(/\/dlsii\/inboundFileFlow\/?$/i, "");
  u = u.replace(/\/dlsii\/ackFileFlow\/?$/i, "");
  u = u.replace(/\/managecomunication\/send-esiti\/?$/i, "");
  u = u.replace(/\/batch\/invoke\/?$/i, "");
  return u.replace(/\/+$/, "") || DEFAULT_HEROKU_BASE;
}

async function getHerokuBase() {
  const vals = await chrome.storage.sync.get({
    herokuBaseUrl: "",
    vt1InboundUrl: "",
  });
  return normalizeHerokuBase(
    vals.herokuBaseUrl || vals.vt1InboundUrl || DEFAULT_HEROKU_BASE
  );
}

/** Costruisce URL Heroku: base + path fisso del flusso. */
async function buildHerokuUrl(path) {
  const base = await getHerokuBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** VT1 / WP1 / SG1 GAS → /dlsii/inboundflow */
async function getVt1Url() {
  return buildHerokuUrl(PATH_DLSII_INBOUND);
}

/** ELE ES1 100/150 (FILE) → /dlsii/inboundFileFlow */
async function getEleEs1InboundFileUrl() {
  return buildHerokuUrl(PATH_DLSII_INBOUND_FILE);
}

async function getEleEs1100Url() {
  return getEleEs1InboundFileUrl();
}

/** ELE ES1 ACK recovery → /dlsii/ackFileFlow */
async function getEleEs1AckUrl() {
  return buildHerokuUrl(PATH_DLSII_ACK_FILE);
}

/** SG1 DTMS → /managecomunication/send-esiti */
async function getSendEsitiUrl() {
  return buildHerokuUrl(PATH_SEND_ESITI);
}

/** Batch run APN → /batch/invoke */
async function getBatchInvokeUrl() {
  return buildHerokuUrl(PATH_BATCH_INVOKE);
}

/** Body default Batch APN con data odierna in runId. */
function buildBatchApnPayload(overrides = {}) {
  const suffix = overrides.runSuffix != null ? String(overrides.runSuffix) : "001";
  const runId =
    overrides.runId != null && String(overrides.runId).trim() !== ""
      ? String(overrides.runId).trim()
      : `collaudo-fl-passivi-${todayYYYYMMDD()}-${suffix}`;
  return {
    runId,
    batchType:
      overrides.batchType != null && String(overrides.batchType).trim() !== ""
        ? String(overrides.batchType).trim()
        : "MS_083",
    dlSiiVariantCode:
      overrides.dlSiiVariantCode != null
        ? String(overrides.dlSiiVariantCode)
        : "",
  };
}

async function getVt1LocalForAuth() {
  return chrome.storage.local.get({
    vt1AuthScheme: "bearer",
    vt1BearerToken: "",
    vt1BasicUser: "",
    vt1BasicPassword: "",
    vt1Cookie: "",
    vt1Authorization: "",
  });
}

async function loadDefaultVt1Payload() {
  const res = await fetch(chrome.runtime.getURL("vt1-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template JSON.");
  return res.json();
}

async function loadDefaultWp1Payload() {
  const res = await fetch(chrome.runtime.getURL("wp1-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template WP1 JSON.");
  return res.json();
}


/** Campi prestazione: supporta sia requests[] sia righe[] (ES1). */
function getPrestazioneFieldsArray(payload) {
  const p = payload?.prestazione;
  if (!p) return null;
  if (Array.isArray(p.requests?.[0]?.fields)) return p.requests[0].fields;
  if (Array.isArray(p.righe?.[0]?.fields)) return p.righe[0].fields;
  return null;
}

function setFieldsFromMap(fields, map) {
  if (!Array.isArray(fields)) return;
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      row.value = v == null ? "" : String(v);
    }
  }
}

async function loadDefaultEleEs1100Payload() {
  const res = await fetch(chrome.runtime.getURL("ele-es1-100-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template ELE ES1 100 JSON.");
  return res.json();
}

async function loadDefaultEleEs1150Payload() {
  const res = await fetch(chrome.runtime.getURL("ele-es1-150-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template ELE ES1 150 JSON.");
  return res.json();
}

async function loadDefaultEleEs1AckPayload() {
  const res = await fetch(chrome.runtime.getURL("ele-es1-ack-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template ELE ES1 ACK JSON.");
  return res.json();
}

function applyEleEs1AckFieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const hdr = p?.prestazione?.header;
  if (hdr) {
    if (values.correlationId != null) {
      hdr.correlationId = String(values.correlationId).trim();
    }
    if (values.esito != null) hdr.esito = values.esito;
    if (values.descrizioneEsito != null) {
      hdr.descrizioneEsito = values.descrizioneEsito;
    }
  }
  const fields = getPrestazioneFieldsArray(p);
  setFieldsFromMap(fields, {
    COD_PRAT_UTENTE: values.codPratUtente || "",
    COD_POD: values.codPod || "",
  });
  return p;
}

function applyEleEs1100FieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const hdr = p?.prestazione?.header;
  if (hdr) {
    hdr.evento = "0S1";
    if (values.venditoreCodice) hdr.venditore = values.venditoreCodice;
    if (values.distributoreCodice) hdr.distributore = values.distributoreCodice;
  }
  const pratica = (values.requestCode || values.documentkey || "").trim();
  const praticaDl =
    (values.codPraticaDl || values.rif_ext || "").trim() ||
    (pratica ? `${pratica}_DL` : "");
  const fields = getPrestazioneFieldsArray(p);
  setFieldsFromMap(fields, {
    1: "ES1",
    2: "0100",
    6: pratica,
    7: praticaDl,
    8: values.desEsitoVerificaAmm || "1",
    9: values.coderrAeeg || "",
    10: values.extAnnotazioni || "",
  });
  return p;
}

function pivaMittenteForVenditore(venditoreCodice) {
  const code = (venditoreCodice || "").trim();
  if (code === "13V0000170") return "00997630322";
  if (code === "13V0000000") return "02221101203";
  return DEFAULT_PIVA_MITT;
}

function applyEleEs1150FieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const hdr = p?.prestazione?.header;
  if (hdr) {
    hdr.evento = "0S2";
    hdr.nomeMessaggio = "S01_0150";
    if (values.venditoreCodice) hdr.venditore = values.venditoreCodice;
    if (values.distributoreCodice) hdr.distributore = values.distributoreCodice;
  }
  const pratica = (values.requestCode || values.documentkey || "").trim();
  const praticaDl =
    (values.codPraticaDl || values.rif_ext || "").trim() ||
    (pratica ? `${pratica}_DL` : "");
  const nome = values.extNome || values.zNome || "";
  const cognome = values.extCognome || values.zCognome || "";
  const fields = getPrestazioneFieldsArray(p);
  setFieldsFromMap(fields, {
    1: "S01",
    2: "0150",
    3: values.pivaMitt || pivaMittenteForVenditore(values.venditoreCodice),
    4: values.codContrDisp || "",
    5: values.pivaDest || "",
    6: pratica,
    7: praticaDl,
    8: "1",
    9: toDDMMYYYYForAv1(values.extDtDecorD),
    10: values.pod || "",
    11: nome,
    12: cognome,
    13: values.extRagsoc || values.zRagsoc || "",
    14: values.extCodFiscale || values.zCodiceFiscale || "",
    15: values.extPartitaIva || values.zPartitaIva || "",
    20: values.extTipoMisuratore || "CE",
    51: values.extPotImp || "6",
    52: values.extPotDisp || "6.6",
    54: values.extTensFase || "BT Monofase",
    55: values.extTensAlim || "220",
    59: values.extOpzTariffa || "ETAB1I00C1",
  });
  return p;
}

async function loadDefaultEleAv1Payload() {
  const res = await fetch(chrome.runtime.getURL("ele-av1-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template ELE AV1 JSON.");
  return res.json();
}

async function loadDefaultSg1Payload() {
  const res = await fetch(chrome.runtime.getURL("sg1-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template SG1 JSON.");
  return res.json();
}

async function loadDefaultSg1DtmsPayload() {
  const res = await fetch(chrome.runtime.getURL("sg1-dtms-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template SG1 DTMS JSON.");
  return res.json();
}

async function loadDefaultGasA01DtecPayload() {
  const res = await fetch(chrome.runtime.getURL("gas-a01-dtec-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template GAS A01 DTEC JSON.");
  return res.json();
}

async function loadDefaultSe1DtecPayload() {
  const res = await fetch(chrome.runtime.getURL("se1-dtec-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template SE1 DTEC JSON.");
  return res.json();
}

async function loadDefaultGasA01Payload() {
  const res = await fetch(chrome.runtime.getURL("gas-a01-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template GAS A01 JSON.");
  return res.json();
}

async function loadDefaultGasA01150Payload() {
  const res = await fetch(chrome.runtime.getURL("gas-a01-150-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template GAS A01 150 JSON.");
  return res.json();
}

async function loadDefaultGasVtg150Payload() {
  const res = await fetch(chrome.runtime.getURL("gas-vtg-150-default-payload.json"));
  if (!res.ok) throw new Error("Impossibile caricare il template GAS VTG 150 JSON.");
  return res.json();
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

function applyTopFieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  const map = {
    DOCUMENTKEY: values.documentkey,
    RIF_EXT: values.rif_ext,
    POD: values.pod,
    EXT_DATA_ESEC: values.extDataEsec,
    EXT_NOME: values.extNome,
    EXT_COGNOME: values.extCognome,
    EXT_RAGSOC: values.extRagsoc,
    EXT_COD_FISCALE: values.extCodFiscale,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      row.value = v == null ? "" : String(v);
    }
  }
  return p;
}

function readTopFieldsFromPayload(payload) {
  const fields = payload?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) {
    return {
      documentkey: "",
      rif_ext: "",
      pod: "",
      extDataEsec: "",
      extNome: "",
      extCognome: "",
      extRagsoc: "",
      extCodFiscale: "",
    };
  }
  const get = (name) => {
    const f = fields.find((x) => x.field === name);
    return f ? String(f.value ?? "").trim() : "";
  };
  return {
    documentkey: get("DOCUMENTKEY"),
    rif_ext: get("RIF_EXT"),
    pod: get("POD"),
    extDataEsec: get("EXT_DATA_ESEC"),
    extNome: get("EXT_NOME"),
    extCognome: get("EXT_COGNOME"),
    extRagsoc: get("EXT_RAGSOC"),
    extCodFiscale: get("EXT_COD_FISCALE"),
  };
}

function applyWp1FieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  const decorOut =
    normalizeDateToYYYYMMDD(values.extDtDecorD) || todayYYYYMMDD();
  const map = {
    DOCUMENTKEY: values.documentkey,
    RIF_EXT: values.rif_ext,
    POD: values.pod,
    COD_PRESTAZ: values.codPrestaz,
    EXT_DT_DECOR_D: decorOut,
    EXT_STATO_RICHIESTA: "1",
    EXT_POT_IMP: values.extPotImp,
    EXT_POT_DISP: values.extPotDisp,
    EXT_OPZ_TARIFFA: values.extOpzTariffa,
    EXT_TENS_FASE: values.extTensFase,
    EXT_TENS_ALIM: values.extTensAlim,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      row.value = v == null ? "" : String(v);
    }
  }
  return normalizeWp1PayloadFields(p);
}

/** Normalizza EXT_DT_DECOR_D in DD/MM/YYYY (ELE AV1). */
function toDDMMYYYYForAv1(raw) {
  const compact = normalizeDateToYYYYMMDD(raw);
  if (compact) return yyyymmddToDDMMYYYY(compact);
  const s = (raw == null ? "" : String(raw)).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return `${String(m[1]).padStart(2, "0")}/${String(m[2]).padStart(2, "0")}/${m[3]}`;
  }
  return todayDDMMYYYY();
}

function applyEleAv1FieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  const map = {
    DOCUMENTKEY: values.documentkey,
    RIF_EXT: values.rif_ext,
    POD: values.pod,
    EXT_DT_DECOR_D: toDDMMYYYYForAv1(values.extDtDecorD),
    EXT_STATO_RICHIESTA: "1",
    EXT_POT_IMP: values.extPotImp,
    EXT_POT_DISP: values.extPotDisp,
    EXT_OPZ_TARIFFA: values.extOpzTariffa,
    EXT_TENS_FASE: values.extTensFase,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      row.value = v == null ? "" : String(v);
    }
  }
  return p;
}

function readEleAv1FieldsFromPayload(payload) {
  const fields = payload?.prestazione?.requests?.[0]?.fields;
  const get = (name) => {
    if (!Array.isArray(fields)) return "";
    const f = fields.find((x) => x.field === name);
    return f ? String(f.value ?? "").trim() : "";
  };
  return {
    documentkey: get("DOCUMENTKEY"),
    rif_ext: get("RIF_EXT"),
    pod: get("POD"),
    extDtDecorD: get("EXT_DT_DECOR_D") || todayDDMMYYYY(),
    extPotImp: get("EXT_POT_IMP"),
    extPotDisp: get("EXT_POT_DISP"),
    extOpzTariffa: get("EXT_OPZ_TARIFFA"),
    extTensFase: get("EXT_TENS_FASE") || "BT_MONOFASE",
  };
}

function readWp1FieldsFromPayload(payload) {
  const fields = payload?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) {
    return {
      documentkey: "",
      rif_ext: "",
      pod: "",
      codPrestaz: "",
      extDtDecorD: "",
      extPotImp: "",
      extPotDisp: "",
      extOpzTariffa: "",
      extTensFase: "",
      extTensAlim: "",
    };
  }
  const get = (name) => {
    const f = fields.find((x) => x.field === name);
    return f ? String(f.value ?? "").trim() : "";
  };
  const rawDecor = get("EXT_DT_DECOR_D");
  return {
    documentkey: get("DOCUMENTKEY"),
    rif_ext: get("RIF_EXT"),
    pod: get("POD"),
    codPrestaz: get("COD_PRESTAZ"),
    extDtDecorD:
      normalizeDateToYYYYMMDD(rawDecor) || rawDecor || todayYYYYMMDD(),
    extPotImp: get("EXT_POT_IMP"),
    extPotDisp: get("EXT_POT_DISP"),
    extOpzTariffa: get("EXT_OPZ_TARIFFA"),
    extTensFase: get("EXT_TENS_FASE"),
    extTensAlim: get("EXT_TENS_ALIM"),
  };
}

function applySg1FieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  const map = {
    DOCUMENTKEY: values.documentkey,
    RIF_EXT: values.rif_ext,
    POD: values.pod,
    Z_NOME: values.zNome,
    Z_COGNOME: values.zCognome,
    Z_RAGSOC: values.zRagsoc,
    Z_CODICE_FISCALE: values.zCodiceFiscale,
    Z_PARTITA_IVA: values.zPartitaIva,
    EXT_SERNR: values.extSernr,
    EXT_ZZTIPOC: values.extZztipoc,
    EXT_COD_CLASSE: values.extCodClasse,
    EXT_CABINA_REMI: values.extCabinaRemi,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      row.value = v == null ? "" : String(v);
    }
  }
  return p;
}

function readSg1FieldsFromPayload(payload) {
  const fields = payload?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) {
    return {
      documentkey: "",
      rif_ext: "",
      pod: "",
      zNome: "",
      zCognome: "",
      zRagsoc: "",
      zCodiceFiscale: "",
      zPartitaIva: "",
      extSernr: "",
      extZztipoc: "",
      extCodClasse: "",
      extCabinaRemi: "",
    };
  }
  const get = (name) => {
    const f = fields.find((x) => x.field === name);
    return f ? String(f.value ?? "").trim() : "";
  };
  return {
    documentkey: get("DOCUMENTKEY"),
    rif_ext: get("RIF_EXT"),
    pod: get("POD"),
    zNome: get("Z_NOME"),
    zCognome: get("Z_COGNOME"),
    zRagsoc: get("Z_RAGSOC"),
    zCodiceFiscale: get("Z_CODICE_FISCALE"),
    zPartitaIva: get("Z_PARTITA_IVA"),
    extSernr: get("EXT_SERNR"),
    extZztipoc: get("EXT_ZZTIPOC"),
    extCodClasse: get("EXT_COD_CLASSE"),
    extCabinaRemi: get("EXT_CABINA_REMI"),
  };
}

/** Imposta le date odierne nei campi DTMS (formato DD/MM/YYYY e MM/YYYY). */
function applySg1DtmsTodayDates(payload) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.fields;
  if (!Array.isArray(fields)) return p;
  const dmy = todayDDMMYYYY();
  const my = todayMMYYYY();
  const map = {
    Z_DT_DECRICHIESTA: dmy,
    Z_MESE_SWITCH: my,
    EXT_DATA_ESEC: dmy,
    Z_DATA_MIS_EFF: dmy,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      row.value = map[row.field];
    }
  }
  return p;
}

function applySg1DtmsFieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (values.requestId != null && String(values.requestId).trim() !== "") {
    const n = Number(values.requestId);
    p.requestId = Number.isFinite(n) ? n : values.requestId;
  }
  if (values.evento != null) p.evento = values.evento;
  if (values.username != null) p.username = values.username;

  const fields = p?.fields;
  if (!Array.isArray(fields)) return applySg1DtmsTodayDates(p);
  const map = {
    POD: values.pod,
    RIF_EXT: values.rif_ext,
    EXT_SERNR: values.extSernr,
    EXT_VOL_ANN_SOST: values.extVolAnnSost,
    Z_LETT_SERNR_SOST: values.zLettSernrSost,
    Z_LETT_SERNR_EFF: values.zLettSernrEff,
    Z_CL_GRUPPOMIS: values.zClGruppomis,
    Z_TP_TRATT: values.zTpTratt,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      if (v != null) row.value = String(v);
    }
  }
  return applySg1DtmsTodayDates(p);
}

function readSg1DtmsFieldsFromPayload(payload) {
  const fields = payload?.fields;
  const get = (name) => {
    if (!Array.isArray(fields)) return "";
    const f = fields.find((x) => x.field === name);
    return f && f.value != null ? String(f.value).trim() : "";
  };
  return {
    requestId: payload?.requestId != null ? String(payload.requestId) : "",
    evento: payload?.evento != null ? String(payload.evento) : "FL",
    username: payload?.username != null ? String(payload.username) : "utente_hera",
    pod: get("POD"),
    rif_ext: get("RIF_EXT"),
    extSernr: get("EXT_SERNR"),
    extVolAnnSost: get("EXT_VOL_ANN_SOST"),
    zLettSernrSost: get("Z_LETT_SERNR_SOST"),
    zLettSernrEff: get("Z_LETT_SERNR_EFF"),
    zClGruppomis: get("Z_CL_GRUPPOMIS"),
    zTpTratt: get("Z_TP_TRATT"),
  };
}

/** Applica campi form al payload GAS A01 DTEC (send-esiti, evento 023). */
function applyGasA01DtecFieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (values.requestId != null && String(values.requestId).trim() !== "") {
    const n = Number(values.requestId);
    p.requestId = Number.isFinite(n) ? n : values.requestId;
  }
  p.evento = values.evento != null ? values.evento : "023";
  if (values.username != null) p.username = values.username;

  const fields = p?.fields;
  if (!Array.isArray(fields)) return p;
  const map = {
    POD: values.pod,
    Z_NOME: values.zNome,
    Z_COGNOME: values.zCognome,
    Z_RAGSOC: values.zRagsoc,
    Z_CODICE_FISCALE: values.zCodiceFiscale,
    Z_PARTITA_IVA: values.zPartitaIva,
    EXT_SERNR: values.extSernr,
    EXT_ZZTIPOC: values.extZztipoc,
    EXT_COD_CLASSE: values.extCodClasse,
    EXT_CABINA_REMI: values.extCabinaRemi,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      if (v != null) row.value = String(v);
    }
  }
  // Matricola correttore allineata al seriale se presente
  if (values.extSernr != null && String(values.extSernr).trim() !== "") {
    const matr = fields.find((x) => x.field === "EXT_MATR_CORR");
    if (matr) matr.value = String(values.extSernr).trim();
  }
  return p;
}

function readGasA01DtecFieldsFromPayload(payload) {
  const fields = payload?.fields;
  const get = (name) => {
    if (!Array.isArray(fields)) return "";
    const f = fields.find((x) => x.field === name);
    return f && f.value != null ? String(f.value).trim() : "";
  };
  return {
    requestId: payload?.requestId != null ? String(payload.requestId) : "",
    evento: payload?.evento != null ? String(payload.evento) : "023",
    username: payload?.username != null ? String(payload.username) : "utente_hera",
    pod: get("POD"),
    zNome: get("Z_NOME"),
    zCognome: get("Z_COGNOME"),
    zRagsoc: get("Z_RAGSOC"),
    zCodiceFiscale: get("Z_CODICE_FISCALE"),
    zPartitaIva: get("Z_PARTITA_IVA"),
    extSernr: get("EXT_SERNR"),
    extZztipoc: get("EXT_ZZTIPOC") || "G4",
    extCodClasse: get("EXT_COD_CLASSE") || "1",
    extCabinaRemi: get("EXT_CABINA_REMI"),
  };
}

/** AAAAMMGG → DD/MM/YYYY (SE1 DTEC). */
function yyyymmddToDDMMYYYY(compact) {
  const s = (compact || "").trim();
  if (!/^\d{8}$/.test(s)) return "";
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** Imposta EXT_DT_DECOR_D a oggi (DD/MM/YYYY). */
function applySe1DtecTodayDates(payload) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.fields;
  if (!Array.isArray(fields)) return p;
  const dmy = todayDDMMYYYY();
  for (const row of fields) {
    if (row.field === "EXT_DT_DECOR_D") row.value = dmy;
  }
  return p;
}

function applySe1DtecFieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (values.requestId != null && String(values.requestId).trim() !== "") {
    const n = Number(values.requestId);
    p.requestId = Number.isFinite(n) ? n : values.requestId;
  }
  if (values.evento != null) p.evento = values.evento;
  if (values.username != null) p.username = values.username;

  const fields = p?.fields;
  if (!Array.isArray(fields)) return applySe1DtecTodayDates(p);
  const map = {
    POD: values.pod,
    RIF_EXT: values.rif_ext,
    COD_CONTR_DISP: values.codContrDisp,
    EXT_POT_IMP: values.extPotImp,
    EXT_POT_DISP: values.extPotDisp,
    EXT_OPZ_TARIFFA: values.extOpzTariffa,
    EXT_TENS_ALIM: values.extTensAlim,
    Z_PUNTODISPACCIAMENTO: values.zPuntoDisp,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      if (v != null) row.value = String(v);
    }
  }
  // Un solo seriale → ATT / REA / POT
  if (values.extSernr != null && String(values.extSernr).trim() !== "") {
    const sernr = String(values.extSernr).trim();
    for (const name of ["EXT_SERNR_ATT", "EXT_SERNR_REA", "EXT_SERNR_POT"]) {
      const f = fields.find((x) => x.field === name);
      if (f) f.value = sernr;
    }
  }
  return applySe1DtecTodayDates(p);
}

function readSe1DtecFieldsFromPayload(payload) {
  const fields = payload?.fields;
  const get = (name) => {
    if (!Array.isArray(fields)) return "";
    const f = fields.find((x) => x.field === name);
    return f && f.value != null ? String(f.value).trim() : "";
  };
  return {
    requestId: payload?.requestId != null ? String(payload.requestId) : "",
    evento: payload?.evento != null ? String(payload.evento) : "FF",
    username: payload?.username != null ? String(payload.username) : "utente_hera",
    pod: get("POD"),
    rif_ext: get("RIF_EXT"),
    codContrDisp: get("COD_CONTR_DISP"),
    extSernr: get("EXT_SERNR_ATT") || get("EXT_SERNR_REA") || get("EXT_SERNR_POT"),
    extPotImp: get("EXT_POT_IMP"),
    extPotDisp: get("EXT_POT_DISP"),
    extOpzTariffa: get("EXT_OPZ_TARIFFA"),
    extTensAlim: get("EXT_TENS_ALIM"),
    zPuntoDisp: get("Z_PUNTODISPACCIAMENTO"),
  };
}

/** Applica DOCUMENTKEY / RIF_EXT / COD_PDR al payload GAS A01 100. */
function applyGasA01FieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  const map = {
    DOCUMENTKEY: values.documentkey,
    COD_PDR: values.codPdr,
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      if (v != null) row.value = String(v);
    }
  }
  const rif = fields.find((x) => x.field === "RIF_EXT");
  if (rif) {
    const raw = values.rif_ext;
    rif.value =
      raw == null || String(raw).trim() === "" ? null : String(raw).trim();
  }
  return p;
}

function readGasA01FieldsFromPayload(payload) {
  const fields = payload?.prestazione?.requests?.[0]?.fields;
  const get = (name) => {
    if (!Array.isArray(fields)) return "";
    const f = fields.find((x) => x.field === name);
    return f && f.value != null ? String(f.value).trim() : "";
  };
  return {
    documentkey: get("DOCUMENTKEY"),
    rif_ext: get("RIF_EXT"),
    codPdr: get("COD_PDR"),
  };
}

/** Applica campi form + EXT_DATA_ESEC (oggi) al payload GAS A01 150. */
function applyGasA01150FieldsToPayload(payload, values) {
  const p = applyGasA01FieldsToPayload(payload, values);
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  const row = fields.find((x) => x.field === "EXT_DATA_ESEC");
  if (row) {
    row.value =
      normalizeDateToYYYYMMDD(values.extDataEsec) ||
      values.extDataEsec ||
      todayYYYYMMDD();
  }
  return p;
}

function readGasA01150FieldsFromPayload(payload) {
  const base = readGasA01FieldsFromPayload(payload);
  const fields = payload?.prestazione?.requests?.[0]?.fields;
  let extDataEsec = "";
  if (Array.isArray(fields)) {
    const f = fields.find((x) => x.field === "EXT_DATA_ESEC");
    if (f && f.value != null) extDataEsec = String(f.value).trim();
  }
  return { ...base, extDataEsec: extDataEsec || todayYYYYMMDD() };
}

/** Applica campi form al payload GAS VTG 150 (evento 09T). */
function applyGasVtg150FieldsToPayload(payload, values) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  p.evento = "09T";
  const fields = p?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return p;
  const map = {
    DOCUMENTKEY: values.documentkey,
    RIF_EXT: values.rif_ext,
    POD: values.pod,
    DES_ESITO_ATTIVITA: values.desEsitoAttivita || "1",
    EXT_CODERR_AEEG: values.extCoderrAeeg || "",
    EXT_ANNOTAZIONI: values.extAnnotazioni || "",
    Z_CODICE_FISCALE: values.zCodiceFiscale || "",
    Z_PARTITA_IVA: values.zPartitaIva || "",
    Z_CF_STRANIERO: values.zCfStraniero || "",
    Z_NOME: values.zNome || "",
    Z_COGNOME: values.zCognome || "",
    Z_RAGSOC: values.zRagsoc || "",
    EXT_DATA_ESEC:
      normalizeDateToYYYYMMDD(values.extDataEsec) ||
      values.extDataEsec ||
      todayYYYYMMDD(),
  };
  for (const row of fields) {
    if (Object.prototype.hasOwnProperty.call(map, row.field)) {
      const v = map[row.field];
      row.value = v == null ? "" : String(v);
    }
  }
  return p;
}

/**
 * Eseguito nel contesto della pagina (tab attivo).
 * Attraversa Shadow DOM (open) e iframe same-origin: spesso i valori non compaiono
 * in Elements perché sono dentro #shadow-root.
 */
function scrapeRichiestaPage() {
  const INPUT_SEL =
    'input[pinputtext], input.ui-inputtext, input[type="text"], input[readonly]';

  function scrub(s) {
    return (s || "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  }

  function normLabel(s) {
    return scrub(s)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /** Document e ogni ShadowRoot visitabile + documenti iframe same-origin. */
  function enumerateRoots() {
    const roots = [];
    const seen = new WeakSet();

    function visit(node) {
      if (!node || seen.has(node)) return;
      seen.add(node);
      roots.push(node);
      let elements;
      try {
        elements = node.querySelectorAll("*");
      } catch (e) {
        return;
      }
      for (const el of elements) {
        if (el.shadowRoot) {
          visit(el.shadowRoot);
        }
        const tag = el.tagName && el.tagName.toUpperCase();
        if (tag === "IFRAME" || tag === "FRAME") {
          try {
            const doc = el.contentDocument;
            if (doc) visit(doc);
          } catch (err) {
            /* cross-origin */
          }
        }
      }
    }

    visit(document);
    return roots;
  }

  function labelMatches(lab, expected) {
    const a = normLabel(lab.textContent);
    const b = normLabel(expected);
    return a === b || a.startsWith(b + " ") || a.startsWith(b + "(");
  }

  function readInputValue(inp) {
    if (!inp) return "";
    let v = (inp.value != null ? String(inp.value) : "").trim();
    if (v) return v;
    v = (inp.defaultValue != null ? String(inp.defaultValue) : "").trim();
    if (v) return v;
    const reflected =
      inp.getAttribute("ng-reflect-model") ||
      inp.getAttribute("ng-reflect-ng-model") ||
      inp.getAttribute("ngReflectNgModel") ||
      inp.getAttribute("ng-reflect-value");
    if (reflected) return reflected.trim();
    return "";
  }

  /** Primo <input> tra i fratelli che precedono la label (salta commenti *ng* di Angular). */
  function firstInputBeforeLabel(lab) {
    const parent = lab.parentElement;
    if (!parent) return null;
    const kids = Array.from(parent.children);
    const idx = kids.indexOf(lab);
    if (idx <= 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
      const node = kids[i];
      if (node && node.tagName === "INPUT") return node;
    }
    return null;
  }

  function findInputNearLabel(lab) {
    const wrap = lab.closest(
      "span.ui-float-label, .ui-float-label, p-floatlabel, .p-float-label, [class*='float-label'], div.p-field"
    );
    if (wrap) {
      const inp = wrap.querySelector(INPUT_SEL);
      if (inp) return readInputValue(inp);
    }
    const prev = lab.previousElementSibling;
    if (prev && prev.matches && prev.matches("input")) {
      return readInputValue(prev);
    }
    const next = lab.nextElementSibling;
    if (next && next.matches && next.matches("input")) {
      return readInputValue(next);
    }
    let el = lab.parentElement;
    for (let i = 0; i < 10 && el; i++) {
      const input = el.querySelector(INPUT_SEL);
      if (input) return readInputValue(input);
      el = el.parentElement;
    }
    return "";
  }

  const allRoots = enumerateRoots();

  /**
   * Limita al componente dettaglio (come nel DOM reale): evita float-label omonimi altrove nella shell.
   */
  function getSearchScopes() {
    const scopes = [];
    for (const r of allRoots) {
      let apps;
      try {
        apps = r.querySelectorAll("app-detail-richieste");
      } catch (e) {
        continue;
      }
      for (const el of apps) scopes.push(el);
    }
    return scopes.length ? scopes : allRoots;
  }

  const searchScopes = getSearchScopes();

  /**
   * PrimeNG: span.ui-float-label con <input> poi <label> (a volte commenti Angular in mezzo).
   * Se ci sono più match, tiene l’ultimo valore non vuoto (ordine documento), così si evita
   * un primo blocco vuoto prima di quello reale.
   */
  function valueFromMatchingFloatWrapper(canonical) {
    const want = normLabel(canonical);
    const shortLabel = want.length <= 5;
    const spanSelectors = [
      "span.ui-float-label",
      ".ui-float-label",
      "p-floatlabel .ui-float-label",
    ];
    let acc = "";
    for (const scope of searchScopes) {
      for (const sel of spanSelectors) {
        let spans;
        try {
          spans = scope.querySelectorAll(sel);
        } catch (e) {
          continue;
        }
        for (const span of spans) {
          const labels = span.querySelectorAll("label");
          for (const lab of labels) {
            const n = normLabel(lab.textContent);
            const match = shortLabel
              ? n === want
              : n === want || n.startsWith(want + " ") || n.startsWith(want + "(");
            if (!match) continue;

            const prevChild = firstInputBeforeLabel(lab);
            const prevEl = lab.previousElementSibling;
            const spanInp = span.querySelector(INPUT_SEL);
            const v =
              (prevChild ? readInputValue(prevChild) : "") ||
              (prevEl && prevEl.tagName === "INPUT"
                ? readInputValue(prevEl)
                : "") ||
              (spanInp ? readInputValue(spanInp) : "");
            if (v) acc = v;
          }
        }
      }
    }
    return acc;
  }

  function getValByLabel(labelText) {
    for (const scope of searchScopes) {
      let labels;
      try {
        labels = Array.from(scope.querySelectorAll("label"));
      } catch (e) {
        continue;
      }
      const lab = labels.find((l) => labelMatches(l, labelText));
      if (!lab) continue;
      const v = findInputNearLabel(lab);
      if (v) return v;
    }
    return "";
  }

  function getField(labelText) {
    return (
      valueFromMatchingFloatWrapper(labelText) || getValByLabel(labelText)
    );
  }

  /** Prova più etichette UI (prima non vuota). */
  function getFieldAny(...labels) {
    for (const lab of labels) {
      const v = getField(lab);
      if (v) return v;
    }
    return "";
  }

  function extractDocumentKeyFromRoot(root) {
    let header;
    try {
      header = root.querySelector(
        "p-header.header-with-button, .header-with-button, [class*='header-with-button']"
      );
    } catch (e) {
      return "";
    }
    if (!header) return "";
    const t = (header.textContent || "").replace(/\s+/g, " ").trim();
    /** Prefisso lettere + solo cifre (es. A000…, ER000…), così non assorbe "Campi" del pulsante vicino. */
    const m = t.match(/Richiesta\s+([A-Za-z]{1,8}\d+)/i);
    if (m) return m[1];
    const inner = header.querySelectorAll("span span");
    if (inner.length) {
      const raw = (inner[inner.length - 1].textContent || "").trim();
      const m2 = raw.match(/^([A-Za-z]{1,8}\d+)/);
      return m2 ? m2[1] : raw;
    }
    return "";
  }

  let documentkey = "";
  for (const scope of searchScopes) {
    documentkey = extractDocumentKeyFromRoot(scope);
    if (documentkey) break;
  }
  if (!documentkey) {
    for (const root of allRoots) {
      documentkey = extractDocumentKeyFromRoot(root);
      if (documentkey) break;
    }
  }

  function parseVenditoreCodice(raw) {
    const s = scrub(raw || "").trim();
    if (!s) return "";
    const m = s.match(/^([0-9A-Z]+)\s*[-–—]\s*/i);
    if (m) return m[1].trim();
    const cut = s.split(/\s+-\s+/)[0];
    return cut.trim();
  }

  function firstNonEmpty(...vals) {
    for (const v of vals) {
      const t = scrub(v).trim();
      if (t) return t;
    }
    return "";
  }

  return {
    documentkey,
    pod: getFieldAny("POD", "PDR", "Codice POD", "Codice PDR"),
    // RIF_EXT ← Codice Pratica SII (etichette tipiche in dettaglio richiesta)
    rif_ext: getFieldAny(
      "Codice Pratica SII",
      "Codice pratica SII",
      "Codice Pratica Sii",
      "Pratica SII",
      "RIF_EXT",
      "Rif Ext"
    ),
    extNome: getFieldAny("Nome"),
    extCognome: getFieldAny("Cognome"),
    extRagsoc: getFieldAny("Ragione Sociale", "Ragione sociale"),
    extCodFiscale: getFieldAny(
      "Codice Fiscale",
      "Codice fiscale",
      "CF",
      "C.F."
    ),
    zCodiceFiscale: getFieldAny(
      "Codice Fiscale",
      "Codice fiscale",
      "CF",
      "C.F."
    ),
    extPartitaIva: getFieldAny(
      "Partita IVA",
      "Partita Iva",
      "Partita iva",
      "P.IVA",
      "P.IVA.",
      "PIVA",
      "P IVA"
    ),
    zPartitaIva: getFieldAny(
      "Partita IVA",
      "Partita Iva",
      "Partita iva",
      "P.IVA",
      "P.IVA.",
      "PIVA",
      "P IVA"
    ),
    venditoreCodice: parseVenditoreCodice(getFieldAny("Venditore")),
    extDtDecorD: firstNonEmpty(
      getFieldAny("Data decorrenza", "Decorrenza", "EXT_DT_DECOR_D")
    ),
  };
}

async function scrapeFromActiveTab() {
  let [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab?.id) {
    throw new Error("Nessun tab attivo.");
  }
  const url = tab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("edge://")) {
    throw new Error("Apri il dettaglio richiesta in un tab normale (non chrome://).");
  }

  function zSc(v) {
    return v == null ? "" : String(v).trim();
  }

  /** La console gira nel mondo MAIN; isolated a volte non vede .value su alcuni input Angular. */
  function mergeScrapePages(iso, main) {
    const keys = [
      "documentkey",
      "pod",
      "rif_ext",
      "extNome",
      "extCognome",
      "extRagsoc",
      "extCodFiscale",
      "zCodiceFiscale",
      "extPartitaIva",
      "zPartitaIva",
      "venditoreCodice",
      "extDtDecorD",
    ];
    const out = {};
    for (const k of keys) {
      out[k] = zSc(iso?.[k]) || zSc(main?.[k]);
    }
    return out;
  }

  let injected;
  try {
    injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeRichiestaPage,
    });
  } catch (e) {
    const inner = e && e.message ? String(e.message) : String(e);
    const permDenied =
      /cannot access|impossibile accedere|permission|host|denied|blocked/i.test(
        inner
      );
    throw new Error(
      permDenied
        ? "Accesso al tab negato da Chrome. Ricarica l’estensione (Aggiorna in chrome://extensions), poi riapri il pannello e riprova. Se compare ancora, in Dettagli estensione abilita l’accesso al sito Hera."
        : `Impossibile leggere la pagina: ${inner}`
    );
  }
  const rawIso = injected?.[0]?.result;

  let rawMain = null;
  try {
    const injMain = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeRichiestaPage,
      world: "MAIN",
    });
    rawMain = injMain?.[0]?.result;
  } catch (e2) {
    /* MAIN non disponibile */
  }

  const raw = mergeScrapePages(rawIso, rawMain);
  const t = (v) => (v == null ? "" : String(v)).trim();
  return {
    documentkey: t(raw.documentkey),
    pod: t(raw.pod),
    rif_ext: t(raw.rif_ext),
    extNome: t(raw.extNome),
    extCognome: t(raw.extCognome),
    extRagsoc: t(raw.extRagsoc),
    extCodFiscale: t(raw.extCodFiscale) || t(raw.zCodiceFiscale),
    zCodiceFiscale: t(raw.zCodiceFiscale) || t(raw.extCodFiscale),
    extPartitaIva: t(raw.extPartitaIva) || t(raw.zPartitaIva),
    zPartitaIva: t(raw.zPartitaIva) || t(raw.extPartitaIva),
    venditoreCodice: t(raw.venditoreCodice),
    extDtDecorD: normalizeDateToYYYYMMDD(t(raw.extDtDecorD)),
  };
}

const DEFAULT_PIVA_MITT = "02221101203";

/** Imposta header.venditore = PA_VT + codice e PIVA_MITT in base al venditore. */
function applyVenditoreToPayload(payload, venditoreCodice) {
  const code = (venditoreCodice || "").trim();
  if (!payload?.prestazione?.header) return;
  if (code) {
    payload.prestazione.header.venditore = "PA_VT" + code;
  }
  const fields = payload?.prestazione?.requests?.[0]?.fields;
  if (!Array.isArray(fields)) return;
  const row = fields.find((x) => x.field === "PIVA_MITT");
  if (!row) return;
  if (code === "13V0000170") {
    row.value = "00997630322";
  } else if (code === "13V0000000") {
    row.value = "02221101203";
  } else {
    row.value = DEFAULT_PIVA_MITT;
  }
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
}

function formatChanges(changes) {
  if (!changes || !changes.length) return "(nessuna voce)";
  return changes
    .map((c) => {
      const tag = c.skipped ? "SALTATO" : "OK";
      const note = c.note ? `\n  nota:  ${c.note}` : "";
      return `[${tag}] [${c.tabella}] ${c.campo}\n  prima: ${c.vecchio}\n  dopo:  ${c.nuovo}${note}`;
    })
    .join("\n\n");
}

function showScreen(name) {
  const home = document.getElementById("screenHome");
  const dates = document.getElementById("screenDates");
  const canale = document.getElementById("screenCanale");
  const sospeso = document.getElementById("screenSospeso");
  const mockupCp1 = document.getElementById("screenMockupCp1");
  const se1Dd = document.getElementById("screenSe1Dd");
  const vt1 = document.getElementById("screenVt1");
  const eleAv1 = document.getElementById("screenEleAv1");
  const eleEs1100 = document.getElementById("screenEleEs1100");
  const eleEs1Ack = document.getElementById("screenEleEs1Ack");
  const eleEs1150 = document.getElementById("screenEleEs1150");
  const wp1 = document.getElementById("screenWp1");
  const gasA01 = document.getElementById("screenGasA01");
  const gasA01150 = document.getElementById("screenGasA01150");
  const gasVtg150 = document.getElementById("screenGasVtg150");
  const gasA01Dtec = document.getElementById("screenGasA01Dtec");
  const sg1 = document.getElementById("screenSg1");
  const sg1Dtms = document.getElementById("screenSg1Dtms");
  const se1Dtec = document.getElementById("screenSe1Dtec");
  const batchApn = document.getElementById("screenBatchApn");
  home.classList.toggle("hidden", name !== "home");
  dates.classList.toggle("hidden", name !== "dates");
  if (canale) canale.classList.toggle("hidden", name !== "canale");
  if (sospeso) sospeso.classList.toggle("hidden", name !== "sospeso");
  if (mockupCp1) mockupCp1.classList.toggle("hidden", name !== "mockupCp1");
  if (se1Dd) se1Dd.classList.toggle("hidden", name !== "se1Dd");
  if (eleAv1) eleAv1.classList.toggle("hidden", name !== "eleAv1");
  if (eleEs1100) eleEs1100.classList.toggle("hidden", name !== "eleEs1100");
  if (eleEs1Ack) eleEs1Ack.classList.toggle("hidden", name !== "eleEs1Ack");
  if (eleEs1150) eleEs1150.classList.toggle("hidden", name !== "eleEs1150");
  vt1.classList.toggle("hidden", name !== "vt1");
  if (wp1) wp1.classList.toggle("hidden", name !== "wp1");
  if (gasA01) gasA01.classList.toggle("hidden", name !== "gasA01");
  if (gasA01150) gasA01150.classList.toggle("hidden", name !== "gasA01150");
  if (gasVtg150) gasVtg150.classList.toggle("hidden", name !== "gasVtg150");
  if (gasA01Dtec) gasA01Dtec.classList.toggle("hidden", name !== "gasA01Dtec");
  if (sg1) sg1.classList.toggle("hidden", name !== "sg1");
  if (sg1Dtms) sg1Dtms.classList.toggle("hidden", name !== "sg1Dtms");
  if (se1Dtec) se1Dtec.classList.toggle("hidden", name !== "se1Dtec");
  if (batchApn) batchApn.classList.toggle("hidden", name !== "batchApn");
}

function wireOpenOptions(...links) {
  for (const a of links) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  /** Ultimo codice venditore letto dalla pagina (per PIVA_MITT / header all’invio). */
  let vt1VenditoreCache = "";
  let eleAv1VenditoreCache = "";
  let wp1VenditoreCache = "";
  let sg1VenditoreCache = "";
  let gasA01VenditoreCache = "";
  let gasA01150VenditoreCache = "";
  let gasVtg150VenditoreCache = "";

  const goDates = document.getElementById("goDates");
  const goCanale = document.getElementById("goCanale");
  const goSospeso = document.getElementById("goSospeso");
  const goMockupCp1 = document.getElementById("goMockupCp1");
  const goSe1Dd = document.getElementById("goSe1Dd");
  const goEleAv1 = document.getElementById("goEleAv1");
  const goEleEs1100 = document.getElementById("goEleEs1100");
  const goEleEs1150 = document.getElementById("goEleEs1150");
  const goEleEs1Ack = document.getElementById("goEleEs1Ack");
  const goVt1 = document.getElementById("goVt1");
  const goWp1 = document.getElementById("goWp1");
  const goGasA01 = document.getElementById("goGasA01");
  const goGasA01150 = document.getElementById("goGasA01150");
  const goGasVtg150 = document.getElementById("goGasVtg150");
  const goGasA01Dtec = document.getElementById("goGasA01Dtec");
  const goSg1 = document.getElementById("goSg1");
  const goSg1Dtms = document.getElementById("goSg1Dtms");
  const goSe1Dtec = document.getElementById("goSe1Dtec");
  const goBatchApn = document.getElementById("goBatchApn");
  const requestCode = document.getElementById("requestCode");
  const runBtn = document.getElementById("runBtn");
  const statusDates = document.getElementById("statusDates");
  const logDates = document.getElementById("logDates");
  const backFromDates = document.getElementById("backFromDates");

  const requestCodeCanale = document.getElementById("requestCodeCanale");
  const runCanaleBtn = document.getElementById("runCanaleBtn");
  const statusCanale = document.getElementById("statusCanale");
  const logCanale = document.getElementById("logCanale");
  const backFromCanale = document.getElementById("backFromCanale");

  const requestCodeSospeso = document.getElementById("requestCodeSospeso");
  const runSospesoBtn = document.getElementById("runSospesoBtn");
  const statusSospeso = document.getElementById("statusSospeso");
  const logSospeso = document.getElementById("logSospeso");
  const backFromSospeso = document.getElementById("backFromSospeso");

  const mockupCp1IdTestata = document.getElementById("mockupCp1IdTestata");
  const mockupCp1LoadBtn = document.getElementById("mockupCp1LoadBtn");
  const mockupCp1ExtPotDisp = document.getElementById("mockupCp1ExtPotDisp");
  const mockupCp1ExtPotImp = document.getElementById("mockupCp1ExtPotImp");
  const mockupCp1UsoFornitura = document.getElementById("mockupCp1UsoFornitura");
  const mockupCp1Pod = document.getElementById("mockupCp1Pod");
  const mockupCp1UpdateBtn = document.getElementById("mockupCp1UpdateBtn");
  const statusMockupCp1 = document.getElementById("statusMockupCp1");
  const logMockupCp1 = document.getElementById("logMockupCp1");
  const backFromMockupCp1 = document.getElementById("backFromMockupCp1");

  const se1DdFilterProcesso = document.getElementById("se1DdFilterProcesso");
  const se1DdFilterVenditore = document.getElementById("se1DdFilterVenditore");
  const se1DdFilterCampo = document.getElementById("se1DdFilterCampo");
  const se1DdSearchBtn = document.getElementById("se1DdSearchBtn");
  const se1DdNuovoBtn = document.getElementById("se1DdNuovoBtn");
  const se1DdResults = document.getElementById("se1DdResults");
  const se1DdEditor = document.getElementById("se1DdEditor");
  const se1DdEditId = document.getElementById("se1DdEditId");
  const se1DdEditProcesso = document.getElementById("se1DdEditProcesso");
  const se1DdEditVenditore = document.getElementById("se1DdEditVenditore");
  const se1DdEditNomeCampo = document.getElementById("se1DdEditNomeCampo");
  const se1DdEditProgressivo = document.getElementById("se1DdEditProgressivo");
  const se1DdEditValoreRichiesta = document.getElementById("se1DdEditValoreRichiesta");
  const se1DdEditValoreDl = document.getElementById("se1DdEditValoreDl");
  const se1DdSaveBtn = document.getElementById("se1DdSaveBtn");
  const se1DdCancelEditBtn = document.getElementById("se1DdCancelEditBtn");
  const statusSe1Dd = document.getElementById("statusSe1Dd");
  const logSe1Dd = document.getElementById("logSe1Dd");
  const backFromSe1Dd = document.getElementById("backFromSe1Dd");
  let se1DdEditMode = "none";
  let se1DdLastRows = [];

  const scrapeAgain = document.getElementById("scrapeAgain");
  const vt1Documentkey = document.getElementById("vt1Documentkey");
  const vt1RifExt = document.getElementById("vt1RifExt");
  const vt1Pod = document.getElementById("vt1Pod");
  const vt1Nome = document.getElementById("vt1Nome");
  const vt1Cognome = document.getElementById("vt1Cognome");
  const vt1Ragsoc = document.getElementById("vt1Ragsoc");
  const vt1Cf = document.getElementById("vt1Cf");
  const vt1ExtData = document.getElementById("vt1ExtData");
  const vt1Cookie = document.getElementById("vt1Cookie");
  const vt1DbJson = document.getElementById("vt1DbJson");
  const vt1Json = document.getElementById("vt1Json");
  const vt1ApplyFields = document.getElementById("vt1ApplyFields");
  const vt1Send = document.getElementById("vt1Send");
  const statusVt1 = document.getElementById("statusVt1");
  const logVt1 = document.getElementById("logVt1");
  const backFromVt1 = document.getElementById("backFromVt1");

  const scrapeAgainEleAv1 = document.getElementById("scrapeAgainEleAv1");
  const eleAv1Documentkey = document.getElementById("eleAv1Documentkey");
  const eleAv1RifExt = document.getElementById("eleAv1RifExt");
  const eleAv1Pod = document.getElementById("eleAv1Pod");
  const eleAv1ExtDtDecor = document.getElementById("eleAv1ExtDtDecor");
  const eleAv1ExtStato = document.getElementById("eleAv1ExtStato");
  const eleAv1PotImp = document.getElementById("eleAv1PotImp");
  const eleAv1PotDisp = document.getElementById("eleAv1PotDisp");
  const eleAv1OpzTariffa = document.getElementById("eleAv1OpzTariffa");
  const eleAv1TensFase = document.getElementById("eleAv1TensFase");
  const eleAv1Cookie = document.getElementById("eleAv1Cookie");
  const eleAv1DbJson = document.getElementById("eleAv1DbJson");
  const eleAv1Json = document.getElementById("eleAv1Json");
  const eleAv1ApplyFields = document.getElementById("eleAv1ApplyFields");
  const eleAv1Send = document.getElementById("eleAv1Send");
  const statusEleAv1 = document.getElementById("statusEleAv1");
  const logEleAv1 = document.getElementById("logEleAv1");
  const backFromEleAv1 = document.getElementById("backFromEleAv1");

  const scrapeAgainEleEs1100 = document.getElementById("scrapeAgainEleEs1100");
  const eleEs1100Documentkey = document.getElementById("eleEs1100Documentkey");
  const eleEs1100RifExt = document.getElementById("eleEs1100RifExt");
  const eleEs1100DesEsito = document.getElementById("eleEs1100DesEsito");
  const eleEs1100Coderr = document.getElementById("eleEs1100Coderr");
  const eleEs1100Annotazioni = document.getElementById("eleEs1100Annotazioni");
  const eleEs1100Cookie = document.getElementById("eleEs1100Cookie");
  const eleEs1100DbJson = document.getElementById("eleEs1100DbJson");
  const eleEs1100Json = document.getElementById("eleEs1100Json");
  const eleEs1100ApplyFields = document.getElementById("eleEs1100ApplyFields");
  const eleEs1100Send = document.getElementById("eleEs1100Send");
  const statusEleEs1100 = document.getElementById("statusEleEs1100");
  const logEleEs1100 = document.getElementById("logEleEs1100");
  const backFromEleEs1100 = document.getElementById("backFromEleEs1100");

  const scrapeAgainEleEs1Ack = document.getElementById("scrapeAgainEleEs1Ack");
  const eleEs1AckCorrelationId = document.getElementById("eleEs1AckCorrelationId");
  const eleEs1AckCodPrat = document.getElementById("eleEs1AckCodPrat");
  const eleEs1AckPod = document.getElementById("eleEs1AckPod");
  const eleEs1AckEsito = document.getElementById("eleEs1AckEsito");
  const eleEs1AckDescrEsito = document.getElementById("eleEs1AckDescrEsito");
  const eleEs1AckCookie = document.getElementById("eleEs1AckCookie");
  const eleEs1AckDbJson = document.getElementById("eleEs1AckDbJson");
  const eleEs1AckJson = document.getElementById("eleEs1AckJson");
  const eleEs1AckApplyFields = document.getElementById("eleEs1AckApplyFields");
  const eleEs1AckSend = document.getElementById("eleEs1AckSend");
  const statusEleEs1Ack = document.getElementById("statusEleEs1Ack");
  const logEleEs1Ack = document.getElementById("logEleEs1Ack");
  const backFromEleEs1Ack = document.getElementById("backFromEleEs1Ack");

  const scrapeAgainEleEs1150 = document.getElementById("scrapeAgainEleEs1150");
  const eleEs1150Documentkey = document.getElementById("eleEs1150Documentkey");
  const eleEs1150RifExt = document.getElementById("eleEs1150RifExt");
  const eleEs1150Pod = document.getElementById("eleEs1150Pod");
  const eleEs1150ExtDtDecor = document.getElementById("eleEs1150ExtDtDecor");
  const eleEs1150CodContrDisp = document.getElementById("eleEs1150CodContrDisp");
  const eleEs1150Nome = document.getElementById("eleEs1150Nome");
  const eleEs1150Cognome = document.getElementById("eleEs1150Cognome");
  const eleEs1150Ragsoc = document.getElementById("eleEs1150Ragsoc");
  const eleEs1150Cf = document.getElementById("eleEs1150Cf");
  const eleEs1150Piva = document.getElementById("eleEs1150Piva");
  const eleEs1150PotImp = document.getElementById("eleEs1150PotImp");
  const eleEs1150PotDisp = document.getElementById("eleEs1150PotDisp");
  const eleEs1150TensAlim = document.getElementById("eleEs1150TensAlim");
  const eleEs1150OpzTariffa = document.getElementById("eleEs1150OpzTariffa");
  const eleEs1150TipoMis = document.getElementById("eleEs1150TipoMis");
  const eleEs1150Cookie = document.getElementById("eleEs1150Cookie");
  const eleEs1150DbJson = document.getElementById("eleEs1150DbJson");
  const eleEs1150Json = document.getElementById("eleEs1150Json");
  const eleEs1150ApplyFields = document.getElementById("eleEs1150ApplyFields");
  const eleEs1150Send = document.getElementById("eleEs1150Send");
  const statusEleEs1150 = document.getElementById("statusEleEs1150");
  const logEleEs1150 = document.getElementById("logEleEs1150");
  const backFromEleEs1150 = document.getElementById("backFromEleEs1150");


  const scrapeAgainWp1 = document.getElementById("scrapeAgainWp1");
  const wp1Documentkey = document.getElementById("wp1Documentkey");
  const wp1RifExt = document.getElementById("wp1RifExt");
  const wp1Pod = document.getElementById("wp1Pod");
  const wp1CodPrestaz = document.getElementById("wp1CodPrestaz");
  const wp1ExtDtDecor = document.getElementById("wp1ExtDtDecor");
  const wp1ExtStato = document.getElementById("wp1ExtStato");
  const wp1PotImp = document.getElementById("wp1PotImp");
  const wp1PotDisp = document.getElementById("wp1PotDisp");
  const wp1OpzTariffa = document.getElementById("wp1OpzTariffa");
  const wp1TensFase = document.getElementById("wp1TensFase");
  const wp1TensAlim = document.getElementById("wp1TensAlim");
  const wp1Cookie = document.getElementById("wp1Cookie");
  const wp1DbJson = document.getElementById("wp1DbJson");
  const wp1Json = document.getElementById("wp1Json");
  const wp1ApplyFields = document.getElementById("wp1ApplyFields");
  const wp1Send = document.getElementById("wp1Send");
  const statusWp1 = document.getElementById("statusWp1");
  const logWp1 = document.getElementById("logWp1");
  const backFromWp1 = document.getElementById("backFromWp1");

  const scrapeAgainGasA01 = document.getElementById("scrapeAgainGasA01");
  const gasA01Documentkey = document.getElementById("gasA01Documentkey");
  const gasA01RifExt = document.getElementById("gasA01RifExt");
  const gasA01CodPdr = document.getElementById("gasA01CodPdr");
  const gasA01Cookie = document.getElementById("gasA01Cookie");
  const gasA01DbJson = document.getElementById("gasA01DbJson");
  const gasA01Json = document.getElementById("gasA01Json");
  const gasA01ApplyFields = document.getElementById("gasA01ApplyFields");
  const gasA01Send = document.getElementById("gasA01Send");
  const statusGasA01 = document.getElementById("statusGasA01");
  const logGasA01 = document.getElementById("logGasA01");
  const backFromGasA01 = document.getElementById("backFromGasA01");

  const scrapeAgainGasA01150 = document.getElementById("scrapeAgainGasA01150");
  const gasA01150Documentkey = document.getElementById("gasA01150Documentkey");
  const gasA01150RifExt = document.getElementById("gasA01150RifExt");
  const gasA01150CodPdr = document.getElementById("gasA01150CodPdr");
  const gasA01150ExtData = document.getElementById("gasA01150ExtData");
  const gasA01150Cookie = document.getElementById("gasA01150Cookie");
  const gasA01150DbJson = document.getElementById("gasA01150DbJson");
  const gasA01150Json = document.getElementById("gasA01150Json");
  const gasA01150ApplyFields = document.getElementById("gasA01150ApplyFields");
  const gasA01150Send = document.getElementById("gasA01150Send");
  const statusGasA01150 = document.getElementById("statusGasA01150");
  const logGasA01150 = document.getElementById("logGasA01150");
  const backFromGasA01150 = document.getElementById("backFromGasA01150");
  const scrapeAgainGasVtg150 = document.getElementById("scrapeAgainGasVtg150");
  const gasVtg150Documentkey = document.getElementById("gasVtg150Documentkey");
  const gasVtg150RifExt = document.getElementById("gasVtg150RifExt");
  const gasVtg150Pod = document.getElementById("gasVtg150Pod");
  const gasVtg150ExtData = document.getElementById("gasVtg150ExtData");
  const gasVtg150DesEsito = document.getElementById("gasVtg150DesEsito");
  const gasVtg150Coderr = document.getElementById("gasVtg150Coderr");
  const gasVtg150Annotazioni = document.getElementById("gasVtg150Annotazioni");
  const gasVtg150Nome = document.getElementById("gasVtg150Nome");
  const gasVtg150Cognome = document.getElementById("gasVtg150Cognome");
  const gasVtg150Ragsoc = document.getElementById("gasVtg150Ragsoc");
  const gasVtg150Cf = document.getElementById("gasVtg150Cf");
  const gasVtg150Piva = document.getElementById("gasVtg150Piva");
  const gasVtg150CfStraniero = document.getElementById("gasVtg150CfStraniero");
  const gasVtg150Cookie = document.getElementById("gasVtg150Cookie");
  const gasVtg150DbJson = document.getElementById("gasVtg150DbJson");
  const gasVtg150Json = document.getElementById("gasVtg150Json");
  const gasVtg150ApplyFields = document.getElementById("gasVtg150ApplyFields");
  const gasVtg150Send = document.getElementById("gasVtg150Send");
  const statusGasVtg150 = document.getElementById("statusGasVtg150");
  const logGasVtg150 = document.getElementById("logGasVtg150");
  const backFromGasVtg150 = document.getElementById("backFromGasVtg150");


  const scrapeAgainGasA01Dtec = document.getElementById("scrapeAgainGasA01Dtec");
  const gasA01DtecRequestId = document.getElementById("gasA01DtecRequestId");
  const gasA01DtecPod = document.getElementById("gasA01DtecPod");
  const gasA01DtecNome = document.getElementById("gasA01DtecNome");
  const gasA01DtecCognome = document.getElementById("gasA01DtecCognome");
  const gasA01DtecRagsoc = document.getElementById("gasA01DtecRagsoc");
  const gasA01DtecCf = document.getElementById("gasA01DtecCf");
  const gasA01DtecPiva = document.getElementById("gasA01DtecPiva");
  const gasA01DtecSernr = document.getElementById("gasA01DtecSernr");
  const gasA01DtecZztipoc = document.getElementById("gasA01DtecZztipoc");
  const gasA01DtecCodClasse = document.getElementById("gasA01DtecCodClasse");
  const gasA01DtecCabinaRemi = document.getElementById("gasA01DtecCabinaRemi");
  const gasA01DtecCookie = document.getElementById("gasA01DtecCookie");
  const gasA01DtecDbJson = document.getElementById("gasA01DtecDbJson");
  const gasA01DtecJson = document.getElementById("gasA01DtecJson");
  const gasA01DtecApplyFields = document.getElementById("gasA01DtecApplyFields");
  const gasA01DtecSend = document.getElementById("gasA01DtecSend");
  const statusGasA01Dtec = document.getElementById("statusGasA01Dtec");
  const logGasA01Dtec = document.getElementById("logGasA01Dtec");
  const backFromGasA01Dtec = document.getElementById("backFromGasA01Dtec");

  const scrapeAgainSg1 = document.getElementById("scrapeAgainSg1");
  const sg1Documentkey = document.getElementById("sg1Documentkey");
  const sg1RifExt = document.getElementById("sg1RifExt");
  const sg1Pod = document.getElementById("sg1Pod");
  const sg1Nome = document.getElementById("sg1Nome");
  const sg1Cognome = document.getElementById("sg1Cognome");
  const sg1Ragsoc = document.getElementById("sg1Ragsoc");
  const sg1Cf = document.getElementById("sg1Cf");
  const sg1Piva = document.getElementById("sg1Piva");
  const sg1Sernr = document.getElementById("sg1Sernr");
  const sg1Zztipoc = document.getElementById("sg1Zztipoc");
  const sg1CodClasse = document.getElementById("sg1CodClasse");
  const sg1CabinaRemi = document.getElementById("sg1CabinaRemi");
  const sg1Cookie = document.getElementById("sg1Cookie");
  const sg1DbJson = document.getElementById("sg1DbJson");
  const sg1Json = document.getElementById("sg1Json");
  const sg1ApplyFields = document.getElementById("sg1ApplyFields");
  const sg1Send = document.getElementById("sg1Send");
  const statusSg1 = document.getElementById("statusSg1");
  const logSg1 = document.getElementById("logSg1");
  const backFromSg1 = document.getElementById("backFromSg1");

  const scrapeAgainSg1Dtms = document.getElementById("scrapeAgainSg1Dtms");
  const sg1DtmsRequestId = document.getElementById("sg1DtmsRequestId");
  const sg1DtmsPod = document.getElementById("sg1DtmsPod");
  const sg1DtmsRifExt = document.getElementById("sg1DtmsRifExt");
  const sg1DtmsSernr = document.getElementById("sg1DtmsSernr");
  const sg1DtmsVolAnn = document.getElementById("sg1DtmsVolAnn");
  const sg1DtmsLettSost = document.getElementById("sg1DtmsLettSost");
  const sg1DtmsLettEff = document.getElementById("sg1DtmsLettEff");
  const sg1DtmsCookie = document.getElementById("sg1DtmsCookie");
  const sg1DtmsDbJson = document.getElementById("sg1DtmsDbJson");
  const sg1DtmsJson = document.getElementById("sg1DtmsJson");
  const sg1DtmsApplyFields = document.getElementById("sg1DtmsApplyFields");
  const sg1DtmsSend = document.getElementById("sg1DtmsSend");
  const statusSg1Dtms = document.getElementById("statusSg1Dtms");
  const logSg1Dtms = document.getElementById("logSg1Dtms");
  const backFromSg1Dtms = document.getElementById("backFromSg1Dtms");

  const scrapeAgainSe1Dtec = document.getElementById("scrapeAgainSe1Dtec");
  const se1DtecRequestId = document.getElementById("se1DtecRequestId");
  const se1DtecPod = document.getElementById("se1DtecPod");
  const se1DtecRifExt = document.getElementById("se1DtecRifExt");
  const se1DtecCodContr = document.getElementById("se1DtecCodContr");
  const se1DtecSernr = document.getElementById("se1DtecSernr");
  const se1DtecPotImp = document.getElementById("se1DtecPotImp");
  const se1DtecPotDisp = document.getElementById("se1DtecPotDisp");
  const se1DtecOpzTariffa = document.getElementById("se1DtecOpzTariffa");
  const se1DtecTensAlim = document.getElementById("se1DtecTensAlim");
  const se1DtecPuntoDisp = document.getElementById("se1DtecPuntoDisp");
  const se1DtecCookie = document.getElementById("se1DtecCookie");
  const se1DtecDbJson = document.getElementById("se1DtecDbJson");
  const se1DtecJson = document.getElementById("se1DtecJson");
  const se1DtecApplyFields = document.getElementById("se1DtecApplyFields");
  const se1DtecSend = document.getElementById("se1DtecSend");
  const statusSe1Dtec = document.getElementById("statusSe1Dtec");
  const logSe1Dtec = document.getElementById("logSe1Dtec");
  const backFromSe1Dtec = document.getElementById("backFromSe1Dtec");

  const batchApnRefreshDates = document.getElementById("batchApnRefreshDates");
  const batchApnRunId = document.getElementById("batchApnRunId");
  const batchApnBatchType = document.getElementById("batchApnBatchType");
  const batchApnVariant = document.getElementById("batchApnVariant");
  const batchApnCookie = document.getElementById("batchApnCookie");
  const batchApnJson = document.getElementById("batchApnJson");
  const batchApnApplyFields = document.getElementById("batchApnApplyFields");
  const batchApnSend = document.getElementById("batchApnSend");
  const statusBatchApn = document.getElementById("statusBatchApn");
  const logBatchApn = document.getElementById("logBatchApn");
  const backFromBatchApn = document.getElementById("backFromBatchApn");

  wireOpenOptions(
    document.getElementById("openOptionsHome"),
    document.getElementById("openOptionsDates"),
    document.getElementById("openOptionsCanale"),
    document.getElementById("openOptionsSospeso"),
    document.getElementById("openOptionsMockupCp1"),
    document.getElementById("openOptionsSe1Dd"),
    document.getElementById("openOptionsVt1"),
    document.getElementById("openOptionsVt1Auth"),
    document.getElementById("openOptionsEleAv1"),
    document.getElementById("openOptionsEleAv1Auth"),
    document.getElementById("openOptionsEleEs1100"),
    document.getElementById("openOptionsEleEs1100Auth"),
    document.getElementById("openOptionsEleEs1150"),
    document.getElementById("openOptionsEleEs1150Auth"),
    document.getElementById("openOptionsEleEs1Ack"),
    document.getElementById("openOptionsEleEs1AckAuth"),
    document.getElementById("openOptionsWp1"),
    document.getElementById("openOptionsWp1Auth"),
    document.getElementById("openOptionsGasA01"),
    document.getElementById("openOptionsGasA01Auth"),
    document.getElementById("openOptionsGasA01150"),
    document.getElementById("openOptionsGasA01150Auth"),
    document.getElementById("openOptionsGasVtg150"),
    document.getElementById("openOptionsGasVtg150Auth"),
    document.getElementById("openOptionsGasA01Dtec"),
    document.getElementById("openOptionsGasA01DtecAuth"),
    document.getElementById("openOptionsSg1"),
    document.getElementById("openOptionsSg1Auth"),
    document.getElementById("openOptionsSg1Dtms"),
    document.getElementById("openOptionsSg1DtmsAuth"),
    document.getElementById("openOptionsSe1Dtec"),
    document.getElementById("openOptionsSe1DtecAuth"),
    document.getElementById("openOptionsBatchApn"),
    document.getElementById("openOptionsBatchApnAuth")
  );

  function collectTopFormValues() {
    return {
      documentkey: vt1Documentkey.value.trim(),
      rif_ext: vt1RifExt.value.trim(),
      pod: vt1Pod.value.trim(),
      extDataEsec: vt1ExtData.value.trim() || todayYYYYMMDD(),
      extNome: vt1Nome.value.trim(),
      extCognome: vt1Cognome.value.trim(),
      extRagsoc: vt1Ragsoc.value.trim(),
      extCodFiscale: vt1Cf.value.trim(),
    };
  }

  function fillVt1InputsFromTop(top) {
    vt1Documentkey.value = top.documentkey;
    vt1RifExt.value = top.rif_ext;
    vt1Pod.value = top.pod;
    vt1ExtData.value = top.extDataEsec || todayYYYYMMDD();
    vt1Nome.value = top.extNome;
    vt1Cognome.value = top.extCognome;
    vt1Ragsoc.value = top.extRagsoc;
    vt1Cf.value = top.extCodFiscale;
  }

  function collectEleAv1FormValues() {
    return {
      documentkey: eleAv1Documentkey.value.trim(),
      rif_ext: eleAv1RifExt.value.trim(),
      pod: eleAv1Pod.value.trim(),
      extDtDecorD: eleAv1ExtDtDecor.value.trim() || todayDDMMYYYY(),
      extPotImp: eleAv1PotImp.value.trim(),
      extPotDisp: eleAv1PotDisp.value.trim(),
      extOpzTariffa: eleAv1OpzTariffa.value.trim(),
      extTensFase: eleAv1TensFase.value.trim() || "BT_MONOFASE",
    };
  }

  function fillEleAv1InputsFromTop(top) {
    eleAv1Documentkey.value = top.documentkey || "";
    eleAv1RifExt.value = top.rif_ext || "";
    eleAv1Pod.value = top.pod || "";
    eleAv1ExtDtDecor.value = top.extDtDecorD || todayDDMMYYYY();
    if (eleAv1ExtStato) eleAv1ExtStato.value = "1";
    eleAv1PotImp.value = top.extPotImp || "3.0";
    eleAv1PotDisp.value = top.extPotDisp || "3.30";
    eleAv1OpzTariffa.value = top.extOpzTariffa || "TD";
    eleAv1TensFase.value = top.extTensFase || "BT_MONOFASE";
  }

  let eleEs1100VenditoreCache = "";
  let eleEs1100DistributoreCache = "";

  function collectEleEs1100FormValues() {
    const requestCode = eleEs1100Documentkey.value.trim();
    return {
      requestCode,
      documentkey: requestCode,
      codPraticaDl: eleEs1100RifExt.value.trim(),
      rif_ext: eleEs1100RifExt.value.trim(),
      desEsitoVerificaAmm: eleEs1100DesEsito.value.trim() || "1",
      coderrAeeg: eleEs1100Coderr.value.trim(),
      extAnnotazioni: eleEs1100Annotazioni.value.trim(),
      venditoreCodice: eleEs1100VenditoreCache,
      distributoreCodice: eleEs1100DistributoreCache,
    };
  }

  function fillEleEs1100InputsFromTop(top) {
    const code = top.requestCode || top.documentkey || "";
    eleEs1100Documentkey.value = code;
    eleEs1100RifExt.value =
      top.codPraticaDl || top.rif_ext || (code ? `${code}_DL` : "");
    eleEs1100DesEsito.value = top.desEsitoVerificaAmm || "1";
    eleEs1100Coderr.value = top.coderrAeeg || "";
    eleEs1100Annotazioni.value = top.extAnnotazioni || "";
  }

  function collectEleEs1AckFormValues() {
    return {
      correlationId: eleEs1AckCorrelationId.value.trim(),
      codPratUtente: eleEs1AckCodPrat.value.trim(),
      codPod: eleEs1AckPod.value.trim(),
      esito: eleEs1AckEsito.value.trim() || "OK",
      descrizioneEsito:
        eleEs1AckDescrEsito.value.trim() || "Scrittura SFTP OK",
    };
  }

  function fillEleEs1AckInputsFromTop(top) {
    if (top.correlationId) {
      eleEs1AckCorrelationId.value = top.correlationId;
    }
    eleEs1AckCodPrat.value = top.codPratUtente || top.requestCode || "";
    eleEs1AckPod.value = top.codPod || top.pod || "";
    eleEs1AckEsito.value = top.esito || "OK";
    eleEs1AckDescrEsito.value = top.descrizioneEsito || "Scrittura SFTP OK";
  }

  let eleEs1150VenditoreCache = "";
  let eleEs1150DistributoreCache = "";
  let eleEs1150PivaDestCache = "";
  let eleEs1150TensFaseCache = "BT Monofase";

  function collectEleEs1150FormValues() {
    const requestCode = eleEs1150Documentkey.value.trim();
    return {
      requestCode,
      documentkey: requestCode,
      codPraticaDl: eleEs1150RifExt.value.trim(),
      rif_ext: eleEs1150RifExt.value.trim(),
      pod: eleEs1150Pod.value.trim(),
      extDtDecorD: eleEs1150ExtDtDecor.value.trim() || todayDDMMYYYY(),
      codContrDisp: eleEs1150CodContrDisp.value.trim(),
      extNome: eleEs1150Nome.value.trim(),
      extCognome: eleEs1150Cognome.value.trim(),
      zNome: eleEs1150Nome.value.trim(),
      zCognome: eleEs1150Cognome.value.trim(),
      extRagsoc: eleEs1150Ragsoc.value.trim(),
      zRagsoc: eleEs1150Ragsoc.value.trim(),
      extCodFiscale: eleEs1150Cf.value.trim(),
      zCodiceFiscale: eleEs1150Cf.value.trim(),
      extPartitaIva: eleEs1150Piva.value.trim(),
      zPartitaIva: eleEs1150Piva.value.trim(),
      extPotImp: eleEs1150PotImp.value.trim() || "6",
      extPotDisp: eleEs1150PotDisp.value.trim() || "6.6",
      extTensAlim: eleEs1150TensAlim.value.trim() || "220",
      extTensFase: eleEs1150TensFaseCache,
      extOpzTariffa: eleEs1150OpzTariffa.value.trim() || "ETAB1I00C1",
      extTipoMisuratore: eleEs1150TipoMis.value.trim() || "CE",
      pivaMitt: pivaMittenteForVenditore(eleEs1150VenditoreCache),
      pivaDest: eleEs1150PivaDestCache,
      venditoreCodice: eleEs1150VenditoreCache,
      distributoreCodice: eleEs1150DistributoreCache,
    };
  }

  function fillEleEs1150InputsFromTop(top) {
    const code = top.requestCode || top.documentkey || "";
    eleEs1150Documentkey.value = code;
    eleEs1150RifExt.value =
      top.codPraticaDl || top.rif_ext || (code ? `${code}_DL` : "");
    eleEs1150Pod.value = top.pod || "";
    eleEs1150ExtDtDecor.value = top.extDtDecorD || todayDDMMYYYY();
    eleEs1150CodContrDisp.value = top.codContrDisp || "";
    eleEs1150Nome.value = top.extNome || top.zNome || "";
    eleEs1150Cognome.value = top.extCognome || top.zCognome || "";
    eleEs1150Ragsoc.value = top.extRagsoc || top.zRagsoc || "";
    eleEs1150Cf.value = top.extCodFiscale || top.zCodiceFiscale || "";
    eleEs1150Piva.value = top.extPartitaIva || top.zPartitaIva || "";
    eleEs1150PotImp.value = top.extPotImp || "6";
    eleEs1150PotDisp.value = top.extPotDisp || "6.6";
    eleEs1150TensAlim.value = top.extTensAlim || "220";
    eleEs1150OpzTariffa.value = top.extOpzTariffa || "ETAB1I00C1";
    eleEs1150TipoMis.value = top.extTipoMisuratore || "CE";
  }


  function collectWp1FormValues() {
    return {
      documentkey: wp1Documentkey.value.trim(),
      rif_ext: wp1RifExt.value.trim(),
      pod: wp1Pod.value.trim(),
      codPrestaz: wp1CodPrestaz.value.trim() || "PV1",
      extDtDecorD: wp1ExtDtDecor.value.trim(),
      extPotImp: wp1PotImp.value.trim(),
      extPotDisp: wp1PotDisp.value.trim(),
      extOpzTariffa: wp1OpzTariffa.value.trim(),
      extTensFase: wp1TensFase.value.trim(),
      extTensAlim: wp1TensAlim.value.trim(),
    };
  }

  function fillWp1InputsFromTop(top) {
    wp1Documentkey.value = top.documentkey;
    wp1RifExt.value = top.rif_ext;
    wp1Pod.value = top.pod;
    wp1CodPrestaz.value = top.codPrestaz || "PV1";
    wp1ExtDtDecor.value =
      normalizeDateToYYYYMMDD(top.extDtDecorD) ||
      top.extDtDecorD ||
      todayYYYYMMDD();
    wp1ExtStato.value = "1";
    wp1PotImp.value = top.extPotImp;
    wp1PotDisp.value = top.extPotDisp;
    wp1OpzTariffa.value = top.extOpzTariffa;
    wp1TensFase.value = top.extTensFase;
    wp1TensAlim.value = top.extTensAlim;
  }

  function collectGasA01FormValues() {
    return {
      documentkey: gasA01Documentkey.value.trim(),
      rif_ext: gasA01RifExt.value.trim(),
      codPdr: gasA01CodPdr.value.trim(),
    };
  }

  function fillGasA01InputsFromTop(top) {
    gasA01Documentkey.value = top.documentkey || "";
    gasA01RifExt.value = top.rif_ext || "";
    gasA01CodPdr.value = top.codPdr || "";
  }

  function collectGasVtg150FormValues() {
    return {
      documentkey: gasVtg150Documentkey.value.trim(),
      rif_ext: gasVtg150RifExt.value.trim(),
      pod: gasVtg150Pod.value.trim(),
      extDataEsec: gasVtg150ExtData.value.trim() || todayYYYYMMDD(),
      desEsitoAttivita: gasVtg150DesEsito.value.trim() || "1",
      extCoderrAeeg: gasVtg150Coderr.value.trim(),
      extAnnotazioni: gasVtg150Annotazioni.value.trim(),
      zNome: gasVtg150Nome.value.trim(),
      zCognome: gasVtg150Cognome.value.trim(),
      zRagsoc: gasVtg150Ragsoc.value.trim(),
      zCodiceFiscale: gasVtg150Cf.value.trim(),
      zPartitaIva: gasVtg150Piva.value.trim(),
      zCfStraniero: gasVtg150CfStraniero.value.trim(),
    };
  }

  function fillGasVtg150InputsFromTop(top) {
    gasVtg150Documentkey.value = top.documentkey || "";
    gasVtg150RifExt.value = top.rif_ext || "";
    gasVtg150Pod.value = top.pod || "";
    gasVtg150ExtData.value = top.extDataEsec || todayYYYYMMDD();
    gasVtg150DesEsito.value = top.desEsitoAttivita || "1";
    gasVtg150Coderr.value = top.extCoderrAeeg || "";
    gasVtg150Annotazioni.value = top.extAnnotazioni || "";
    gasVtg150Nome.value = top.zNome || "";
    gasVtg150Cognome.value = top.zCognome || "";
    gasVtg150Ragsoc.value = top.zRagsoc || "";
    gasVtg150Cf.value = top.zCodiceFiscale || "";
    gasVtg150Piva.value = top.zPartitaIva || "";
    gasVtg150CfStraniero.value = top.zCfStraniero || "";
  }

  function collectGasA01150FormValues() {
    return {
      documentkey: gasA01150Documentkey.value.trim(),
      rif_ext: gasA01150RifExt.value.trim(),
      codPdr: gasA01150CodPdr.value.trim(),
      extDataEsec: gasA01150ExtData.value.trim() || todayYYYYMMDD(),
    };
  }

  function fillGasA01150InputsFromTop(top) {
    gasA01150Documentkey.value = top.documentkey || "";
    gasA01150RifExt.value = top.rif_ext || "";
    gasA01150CodPdr.value = top.codPdr || "";
    gasA01150ExtData.value = top.extDataEsec || todayYYYYMMDD();
  }

  function collectSg1FormValues() {
    return {
      documentkey: sg1Documentkey.value.trim(),
      rif_ext: sg1RifExt.value.trim(),
      pod: sg1Pod.value.trim(),
      zNome: sg1Nome.value.trim(),
      zCognome: sg1Cognome.value.trim(),
      zRagsoc: sg1Ragsoc.value.trim(),
      zCodiceFiscale: sg1Cf.value.trim(),
      zPartitaIva: sg1Piva.value.trim(),
      extSernr: sg1Sernr.value.trim(),
      extZztipoc: sg1Zztipoc.value.trim(),
      extCodClasse: sg1CodClasse.value.trim(),
      extCabinaRemi: sg1CabinaRemi.value.trim(),
    };
  }

  function fillSg1InputsFromTop(top) {
    sg1Documentkey.value = top.documentkey;
    sg1RifExt.value = top.rif_ext;
    sg1Pod.value = top.pod;
    sg1Nome.value = top.zNome;
    sg1Cognome.value = top.zCognome;
    sg1Ragsoc.value = top.zRagsoc;
    sg1Cf.value = top.zCodiceFiscale;
    sg1Piva.value = top.zPartitaIva;
    sg1Sernr.value = top.extSernr;
    sg1Zztipoc.value = top.extZztipoc || "G4";
    sg1CodClasse.value = top.extCodClasse || "C2X1";
    sg1CabinaRemi.value = top.extCabinaRemi;
  }

  function collectSg1DtmsFormValues() {
    return {
      requestId: sg1DtmsRequestId.value.trim(),
      evento: "FL",
      username: "utente_hera",
      pod: sg1DtmsPod.value.trim(),
      rif_ext: sg1DtmsRifExt.value.trim(),
      extSernr: sg1DtmsSernr.value.trim(),
      extVolAnnSost: sg1DtmsVolAnn.value.trim(),
      zLettSernrSost: sg1DtmsLettSost.value.trim(),
      zLettSernrEff: sg1DtmsLettEff.value.trim(),
      zClGruppomis: "G40",
      zTpTratt: "M",
    };
  }

  function fillSg1DtmsInputsFromTop(top) {
    sg1DtmsRequestId.value = top.requestId || "";
    sg1DtmsPod.value = top.pod || "";
    sg1DtmsRifExt.value = top.rif_ext || "";
    sg1DtmsSernr.value = top.extSernr || "";
    sg1DtmsVolAnn.value = top.extVolAnnSost || "";
    sg1DtmsLettSost.value = top.zLettSernrSost || "";
    sg1DtmsLettEff.value = top.zLettSernrEff || "";
  }

  function collectGasA01DtecFormValues() {
    return {
      requestId: gasA01DtecRequestId.value.trim(),
      evento: "023",
      username: "utente_hera",
      pod: gasA01DtecPod.value.trim(),
      zNome: gasA01DtecNome.value.trim(),
      zCognome: gasA01DtecCognome.value.trim(),
      zRagsoc: gasA01DtecRagsoc.value.trim(),
      zCodiceFiscale: gasA01DtecCf.value.trim(),
      zPartitaIva: gasA01DtecPiva.value.trim(),
      extSernr: gasA01DtecSernr.value.trim(),
      extZztipoc: gasA01DtecZztipoc.value.trim() || "G4",
      extCodClasse: gasA01DtecCodClasse.value.trim() || "1",
      extCabinaRemi: gasA01DtecCabinaRemi.value.trim(),
    };
  }

  function fillGasA01DtecInputsFromTop(top) {
    gasA01DtecRequestId.value = top.requestId || "";
    gasA01DtecPod.value = top.pod || "";
    gasA01DtecNome.value = top.zNome || "";
    gasA01DtecCognome.value = top.zCognome || "";
    gasA01DtecRagsoc.value = top.zRagsoc || "";
    gasA01DtecCf.value = top.zCodiceFiscale || "";
    gasA01DtecPiva.value = top.zPartitaIva || "";
    gasA01DtecSernr.value = top.extSernr || "";
    gasA01DtecZztipoc.value = top.extZztipoc || "G4";
    gasA01DtecCodClasse.value = top.extCodClasse || "1";
    gasA01DtecCabinaRemi.value = top.extCabinaRemi || "";
  }

  function collectSe1DtecFormValues() {
    return {
      requestId: se1DtecRequestId.value.trim(),
      evento: "FF",
      username: "utente_hera",
      pod: se1DtecPod.value.trim(),
      rif_ext: se1DtecRifExt.value.trim(),
      codContrDisp: se1DtecCodContr.value.trim(),
      extSernr: se1DtecSernr.value.trim(),
      extPotImp: se1DtecPotImp.value.trim(),
      extPotDisp: se1DtecPotDisp.value.trim(),
      extOpzTariffa: se1DtecOpzTariffa.value.trim(),
      extTensAlim: se1DtecTensAlim.value.trim(),
      zPuntoDisp: se1DtecPuntoDisp.value.trim(),
    };
  }

  function fillSe1DtecInputsFromTop(top) {
    se1DtecRequestId.value = top.requestId || "";
    se1DtecPod.value = top.pod || "";
    se1DtecRifExt.value = top.rif_ext || "";
    se1DtecCodContr.value = top.codContrDisp || "DP4119";
    se1DtecSernr.value = top.extSernr || "";
    se1DtecPotImp.value = top.extPotImp || "";
    se1DtecPotDisp.value = top.extPotDisp || "";
    se1DtecOpzTariffa.value = top.extOpzTariffa || "BTA4";
    se1DtecTensAlim.value = top.extTensAlim || "220";
    se1DtecPuntoDisp.value = top.zPuntoDisp || "NORD";
  }

  goDates.addEventListener("click", async () => {
    showScreen("dates");
    setStatus(statusDates, "", "");
    logDates.classList.add("hidden");
    try {
      const s = await scrapeFromActiveTab();
      if (s.documentkey) requestCode.value = s.documentkey;
    } catch {
      /* tab non accessibile o non in dettaglio richiesta */
    }
  });

  goCanale.addEventListener("click", async () => {
    showScreen("canale");
    setStatus(statusCanale, "", "");
    logCanale.classList.add("hidden");
    try {
      const s = await scrapeFromActiveTab();
      if (s.documentkey) requestCodeCanale.value = s.documentkey;
    } catch {
      /* tab non accessibile o non in dettaglio richiesta */
    }
  });

  goSospeso.addEventListener("click", async () => {
    showScreen("sospeso");
    setStatus(statusSospeso, "", "");
    logSospeso.classList.add("hidden");
    try {
      const s = await scrapeFromActiveTab();
      if (s.documentkey) requestCodeSospeso.value = s.documentkey;
    } catch {
      /* tab non accessibile o non in dettaglio richiesta */
    }
  });

  goMockupCp1.addEventListener("click", async () => {
    showScreen("mockupCp1");
    setStatus(statusMockupCp1, "", "");
    logMockupCp1.classList.add("hidden");
    logMockupCp1.textContent = "";
    if (!mockupCp1IdTestata.value.trim()) mockupCp1IdTestata.value = "802";
    await loadMockupCp1Fields();
  });

  goSe1Dd.addEventListener("click", () => {
    showScreen("se1Dd");
    setStatus(statusSe1Dd, "", "");
    logSe1Dd.classList.add("hidden");
    logSe1Dd.textContent = "";
    hideSe1DdEditor();
    hideSe1DdResults();
  });

  goVt1.addEventListener("click", async () => {
    showScreen("vt1");
    logVt1.classList.add("hidden");
    logVt1.textContent = "";
    setStatus(statusVt1, "Caricamento…", "");
    await populateVt1Screen(true);
  });

  goEleAv1.addEventListener("click", async () => {
    showScreen("eleAv1");
    logEleAv1.classList.add("hidden");
    logEleAv1.textContent = "";
    setStatus(statusEleAv1, "Caricamento…", "");
    await populateEleAv1Screen(true);
  });

  goEleEs1100.addEventListener("click", async () => {
    showScreen("eleEs1100");
    logEleEs1100.classList.add("hidden");
    logEleEs1100.textContent = "";
    setStatus(statusEleEs1100, "Caricamento…", "");
    await populateEleEs1100Screen(true);
  });

  goEleEs1150.addEventListener("click", async () => {
    showScreen("eleEs1150");
    logEleEs1150.classList.add("hidden");
    logEleEs1150.textContent = "";
    setStatus(statusEleEs1150, "Caricamento…", "");
    await populateEleEs1150Screen(true);
  });

  goEleEs1Ack.addEventListener("click", async () => {
    showScreen("eleEs1Ack");
    logEleEs1Ack.classList.add("hidden");
    logEleEs1Ack.textContent = "";
    setStatus(statusEleEs1Ack, "Caricamento…", "");
    await populateEleEs1AckScreen(true);
  });

  goWp1.addEventListener("click", async () => {
    showScreen("wp1");
    logWp1.classList.add("hidden");
    logWp1.textContent = "";
    setStatus(statusWp1, "Caricamento…", "");
    await populateWp1Screen(true);
  });

  goGasA01.addEventListener("click", async () => {
    showScreen("gasA01");
    logGasA01.classList.add("hidden");
    logGasA01.textContent = "";
    setStatus(statusGasA01, "Caricamento…", "");
    await populateGasA01Screen(true);
  });

  goGasA01150.addEventListener("click", async () => {
    showScreen("gasA01150");
    logGasA01150.classList.add("hidden");
    logGasA01150.textContent = "";
    setStatus(statusGasA01150, "Caricamento…", "");
    await populateGasA01150Screen(true);
  });

  goGasVtg150.addEventListener("click", async () => {
    showScreen("gasVtg150");
    logGasVtg150.classList.add("hidden");
    logGasVtg150.textContent = "";
    setStatus(statusGasVtg150, "Caricamento…", "");
    await populateGasVtg150Screen(true);
  });

  goGasA01Dtec.addEventListener("click", async () => {
    showScreen("gasA01Dtec");
    logGasA01Dtec.classList.add("hidden");
    logGasA01Dtec.textContent = "";
    setStatus(statusGasA01Dtec, "Caricamento…", "");
    await populateGasA01DtecScreen(true);
  });

  goSg1.addEventListener("click", async () => {
    showScreen("sg1");
    logSg1.classList.add("hidden");
    logSg1.textContent = "";
    setStatus(statusSg1, "Caricamento…", "");
    await populateSg1Screen(true);
  });

  goSg1Dtms.addEventListener("click", async () => {
    showScreen("sg1Dtms");
    logSg1Dtms.classList.add("hidden");
    logSg1Dtms.textContent = "";
    setStatus(statusSg1Dtms, "Caricamento…", "");
    await populateSg1DtmsScreen(true);
  });

  goSe1Dtec.addEventListener("click", async () => {
    showScreen("se1Dtec");
    logSe1Dtec.classList.add("hidden");
    logSe1Dtec.textContent = "";
    setStatus(statusSe1Dtec, "Caricamento…", "");
    await populateSe1DtecScreen(true);
  });

  goBatchApn.addEventListener("click", async () => {
    showScreen("batchApn");
    logBatchApn.classList.add("hidden");
    logBatchApn.textContent = "";
    setStatus(statusBatchApn, "", "");
    await populateBatchApnScreen();
  });

  backFromDates.addEventListener("click", () => showScreen("home"));
  backFromCanale.addEventListener("click", () => showScreen("home"));
  backFromSospeso.addEventListener("click", () => showScreen("home"));
  backFromMockupCp1.addEventListener("click", () => showScreen("home"));
  backFromSe1Dd.addEventListener("click", () => showScreen("home"));
  backFromVt1.addEventListener("click", () => showScreen("home"));
  backFromEleAv1.addEventListener("click", () => showScreen("home"));
  backFromEleEs1100.addEventListener("click", () => showScreen("home"));
  backFromEleEs1Ack.addEventListener("click", () => showScreen("home"));
  backFromEleEs1150.addEventListener("click", () => showScreen("home"));
  backFromWp1.addEventListener("click", () => showScreen("home"));
  backFromGasA01.addEventListener("click", () => showScreen("home"));
  backFromGasA01150.addEventListener("click", () => showScreen("home"));
  backFromGasVtg150.addEventListener("click", () => showScreen("home"));
  backFromGasA01Dtec.addEventListener("click", () => showScreen("home"));
  backFromSg1.addEventListener("click", () => showScreen("home"));
  backFromSg1Dtms.addEventListener("click", () => showScreen("home"));
  backFromSe1Dtec.addEventListener("click", () => showScreen("home"));
  backFromBatchApn.addEventListener("click", () => showScreen("home"));

  runBtn.addEventListener("click", async () => {
    const code = requestCode.value.trim();
    logDates.classList.add("hidden");
    logDates.textContent = "";

    if (!code) {
      setStatus(statusDates, "Inserisci il codice richiesta.", "err");
      return;
    }

    runBtn.disabled = true;
    setStatus(statusDates, "Connessione al server locale…", "");

    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_code: code }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setStatus(
          statusDates,
          data.error || data.message || `Errore HTTP ${res.status}`,
          "err"
        );
        return;
      }

      const skipped = (data.changes || []).filter((c) => c.skipped).length;
      const updated = (data.changes || []).filter((c) => !c.skipped).length;
      const statusMsg =
        skipped > 0
          ? `Operazione completata: ${updated} aggiornati, ${skipped} saltati (vedi log).`
          : "Operazione completata.";
      setStatus(statusDates, statusMsg, "ok");
      logDates.textContent = formatChanges(data.changes);
      logDates.classList.remove("hidden");
    } catch (e) {
      const msg =
        e instanceof TypeError && String(e.message).includes("fetch")
          ? "Impossibile contattare il server locale. Avvia update_dates_api_server.py."
          : String(e.message || e);
      setStatus(statusDates, msg, "err");
    } finally {
      runBtn.disabled = false;
    }
  });

  runCanaleBtn.addEventListener("click", async () => {
    const code = requestCodeCanale.value.trim();
    logCanale.classList.add("hidden");
    logCanale.textContent = "";

    if (!code) {
      setStatus(statusCanale, "Inserisci il codice richiesta.", "err");
      return;
    }

    runCanaleBtn.disabled = true;
    setStatus(statusCanale, "Connessione al server…", "");

    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/switch-canale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_code: code }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setStatus(
          statusCanale,
          data.error || data.message || `Errore HTTP ${res.status}`,
          "err"
        );
        return;
      }

      const change = (data.changes || [])[0];
      const msg = change
        ? `Switch completato: ${change.vecchio} → ${change.nuovo}`
        : "Switch completato.";
      setStatus(statusCanale, msg, "ok");
      logCanale.textContent = formatChanges(data.changes);
      logCanale.classList.remove("hidden");
    } catch (e) {
      const msg =
        e instanceof TypeError && String(e.message).includes("fetch")
          ? "Impossibile contattare il server. Avvia update_dates_api_server.py o verifica l’URL Render."
          : String(e.message || e);
      setStatus(statusCanale, msg, "err");
    } finally {
      runCanaleBtn.disabled = false;
    }
  });

  runSospesoBtn.addEventListener("click", async () => {
    const code = requestCodeSospeso.value.trim();
    logSospeso.classList.add("hidden");
    logSospeso.textContent = "";

    if (!code) {
      setStatus(statusSospeso, "Inserisci il codice richiesta.", "err");
      return;
    }

    runSospesoBtn.disabled = true;
    setStatus(statusSospeso, "Connessione al server…", "");

    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/riporta-sospeso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_code: code }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setStatus(
          statusSospeso,
          data.error || data.message || `Errore HTTP ${res.status}`,
          "err"
        );
        if (data.changes) {
          logSospeso.textContent = formatChanges(data.changes);
          logSospeso.classList.remove("hidden");
        }
        return;
      }

      setStatus(
        statusSospeso,
        "Richiesta riportata in sospeso (message_state=SOSPESO, attiva_sap vuoto).",
        "ok"
      );
      logSospeso.textContent = formatChanges(data.changes);
      logSospeso.classList.remove("hidden");
    } catch (e) {
      const msg =
        e instanceof TypeError && String(e.message).includes("fetch")
          ? "Impossibile contattare il server. Avvia update_dates_api_server.py o verifica l’URL Render."
          : String(e.message || e);
      setStatus(statusSospeso, msg, "err");
    } finally {
      runSospesoBtn.disabled = false;
    }
  });

  function hideSe1DdEditor() {
    se1DdEditMode = "none";
    se1DdEditor.classList.add("hidden");
  }

  function hideSe1DdResults() {
    se1DdLastRows = [];
    if (se1DdResults) {
      se1DdResults.textContent = "";
      se1DdResults.classList.add("hidden");
    }
  }

  function showSe1DdResults() {
    if (se1DdResults) se1DdResults.classList.remove("hidden");
  }

  const se1DdEditIdRow = document.getElementById("se1DdEditIdRow");
  const se1DdEditProgressivoRow = document.getElementById("se1DdEditProgressivoRow");
  const se1DdEditorTitle = document.getElementById("se1DdEditorTitle");

  function fillSe1DdEditorFromRow(row, mode) {
    hideSe1DdResults();
    setStatus(statusSe1Dd, "", "");
    se1DdEditMode = mode;
    se1DdEditor.classList.remove("hidden");
    const isNew = mode === "new";
    if (se1DdEditIdRow) se1DdEditIdRow.classList.toggle("hidden", isNew);
    if (se1DdEditProgressivoRow) se1DdEditProgressivoRow.classList.toggle("hidden", isNew);
    if (se1DdEditorTitle) {
      se1DdEditorTitle.textContent = isNew
        ? "Nuovo record"
        : `Modifica record #${row.att_ck_ddi_id ?? ""}`;
    }
    se1DdEditId.value =
      !isNew && row.att_ck_ddi_id != null ? String(row.att_ck_ddi_id) : "";
    se1DdEditProcesso.value = row.processo_code || "";
    se1DdEditVenditore.value = row.venditore_code || "";
    se1DdEditNomeCampo.value = row.nome_campo || "TAR_AEEG_EE";
    se1DdEditProgressivo.value =
      row.progressivo != null && row.progressivo !== "" ? String(row.progressivo) : "";
    se1DdEditValoreRichiesta.value = row.valore_richiesta || "";
    se1DdEditValoreDl.value = row.valore_dl || "";
    se1DdEditProgressivo.readOnly = isNew;
    se1DdEditNomeCampo.readOnly = isNew;
  }

  function renderSe1DdResults(rows) {
    se1DdLastRows = rows;
    showSe1DdResults();
    se1DdResults.textContent = "";
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.style.margin = "8px";
      empty.textContent = "Nessuna riga trovata.";
      se1DdResults.appendChild(empty);
      return;
    }
    rows.forEach((row, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "se1-dd-row";
      const main = document.createElement("div");
      main.className = "se1-dd-row-main";
      main.textContent = [
        `#${row.att_ck_ddi_id}`,
        `prog ${row.progressivo}`,
        row.nome_campo,
        `rich=${row.valore_richiesta}`,
        `dl=${row.valore_dl ?? ""}`,
      ].join(" · ");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "se1-dd-edit-icon";
      btn.title = "Modifica";
      btn.textContent = "✎";
      btn.addEventListener("click", () => fillSe1DdEditorFromRow(row, "edit"));
      wrap.appendChild(main);
      wrap.appendChild(btn);
      se1DdResults.appendChild(wrap);
    });
  }

  function se1DdFilterValues() {
    return {
      processo: se1DdFilterProcesso.value.trim(),
      venditore: se1DdFilterVenditore.value.trim(),
      campo: se1DdFilterCampo.value.trim(),
    };
  }

  async function searchSe1Dd() {
    const f = se1DdFilterValues();
    hideSe1DdEditor();
    hideSe1DdResults();
    logSe1Dd.classList.add("hidden");
    se1DdSearchBtn.disabled = true;
    setStatus(statusSe1Dd, "Ricerca in corso…", "");
    try {
      const base = await getApiBase();
      const q = new URLSearchParams({
        processo_code: f.processo,
        venditore_code: f.venditore,
        valore_richiesta: f.campo,
      });
      const res = await fetch(`${base}/se1-dd/search?${q.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus(
          statusSe1Dd,
          data.error || data.message || `Errore HTTP ${res.status}`,
          "err"
        );
        se1DdResults.textContent = "";
        return;
      }
      const rows = Array.isArray(data.rows) ? data.rows : [];
      renderSe1DdResults(rows);
      setStatus(statusSe1Dd, `${rows.length} righe trovate.`, "ok");
    } catch (e) {
      setStatus(statusSe1Dd, String(e.message || e), "err");
    } finally {
      se1DdSearchBtn.disabled = false;
    }
  }

  se1DdSearchBtn.addEventListener("click", () => searchSe1Dd());

  se1DdNuovoBtn.addEventListener("click", () => {
    const f = se1DdFilterValues();
    fillSe1DdEditorFromRow(
      {
        processo_code: f.processo || "SE1",
        venditore_code: f.venditore || "13V0000000",
        valore_richiesta: f.campo || "TD",
        nome_campo: "TAR_AEEG_EE",
        progressivo: "(auto)",
        valore_dl: "",
      },
      "new"
    );
    setStatus(
      statusSe1Dd,
      "Nuovo record: id e progressivo assegnati dal sistema al salvataggio.",
      ""
    );
  });

  se1DdCancelEditBtn.addEventListener("click", () => hideSe1DdEditor());

  se1DdSaveBtn.addEventListener("click", async () => {
    logSe1Dd.classList.add("hidden");
    se1DdSaveBtn.disabled = true;
    setStatus(statusSe1Dd, "Salvataggio…", "");
    try {
      const base = await getApiBase();
      const record = {
        processo_code: se1DdEditProcesso.value.trim(),
        venditore_code: se1DdEditVenditore.value.trim(),
        nome_campo: se1DdEditNomeCampo.value.trim(),
        progressivo: se1DdEditProgressivo.value.trim(),
        valore_richiesta: se1DdEditValoreRichiesta.value.trim(),
        valore_dl: se1DdEditValoreDl.value.trim(),
      };
      let url;
      let body;
      if (se1DdEditMode === "new") {
        url = `${base}/se1-dd/create`;
        body = {
          processo_code: record.processo_code,
          venditore_code: record.venditore_code,
          valore_richiesta: record.valore_richiesta,
          valore_dl: record.valore_dl,
          nome_campo: record.nome_campo || "TAR_AEEG_EE",
        };
      } else {
        url = `${base}/se1-dd/update`;
        record.att_ck_ddi_id = se1DdEditId.value.trim();
        body = { record };
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus(
          statusSe1Dd,
          data.error || data.message || `Errore HTTP ${res.status}`,
          "err"
        );
        if (data.changes) {
          logSe1Dd.textContent = formatChanges(data.changes);
          logSe1Dd.classList.remove("hidden");
        }
        return;
      }
      hideSe1DdEditor();
      setStatus(statusSe1Dd, "Salvato.", "ok");
      if (data.changes?.length) {
        logSe1Dd.textContent = formatChanges(data.changes);
        logSe1Dd.classList.remove("hidden");
      }
      await searchSe1Dd();
    } catch (e) {
      setStatus(statusSe1Dd, String(e.message || e), "err");
    } finally {
      se1DdSaveBtn.disabled = false;
    }
  });

  /** Carica i campi CP1 da amc.simulatore_risposta_campi. */
  async function loadMockupCp1Fields() {
    const idTestata = mockupCp1IdTestata.value.trim() || "802";
    mockupCp1IdTestata.value = idTestata;
    logMockupCp1.classList.add("hidden");
    logMockupCp1.textContent = "";
    mockupCp1LoadBtn.disabled = true;
    setStatus(statusMockupCp1, "Carico campi da DB…", "");

    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/mockup-cp1/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_risposta_testata: idTestata }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus(
          statusMockupCp1,
          data.error || data.message || `Errore HTTP ${res.status}`,
          "err"
        );
        return;
      }
      const f = data.fields || {};
      mockupCp1ExtPotDisp.value = f.EXT_POT_DISP || "";
      mockupCp1ExtPotImp.value = f.EXT_POT_IMP || "";
      mockupCp1UsoFornitura.value = f.USO_FORNITURA || "";
      mockupCp1Pod.value = f.POD || "";
      const missing = Array.isArray(data.missing) ? data.missing : [];
      setStatus(
        statusMockupCp1,
        missing.length
          ? `Campi caricati (mancanti in DB: ${missing.join(", ")}).`
          : `Campi caricati · id_risposta_testata=${data.id_risposta_testata}.`,
        missing.length ? "err" : "ok"
      );
    } catch (e) {
      const msg =
        e instanceof TypeError && String(e.message).includes("fetch")
          ? "Impossibile contattare il server. Avvia update_dates_api_server.py o verifica l’URL Render."
          : String(e.message || e);
      setStatus(statusMockupCp1, msg, "err");
    } finally {
      mockupCp1LoadBtn.disabled = false;
    }
  }

  mockupCp1LoadBtn.addEventListener("click", async () => {
    await loadMockupCp1Fields();
  });

  mockupCp1UpdateBtn.addEventListener("click", async () => {
    const idTestata = mockupCp1IdTestata.value.trim() || "802";
    mockupCp1IdTestata.value = idTestata;
    logMockupCp1.classList.add("hidden");
    logMockupCp1.textContent = "";
    mockupCp1UpdateBtn.disabled = true;
    setStatus(statusMockupCp1, "Aggiorno campi su DB…", "");

    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/mockup-cp1/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_risposta_testata: idTestata,
          fields: {
            EXT_POT_DISP: mockupCp1ExtPotDisp.value,
            EXT_POT_IMP: mockupCp1ExtPotImp.value,
            USO_FORNITURA: mockupCp1UsoFornitura.value,
            POD: mockupCp1Pod.value,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus(
          statusMockupCp1,
          data.error || data.message || `Errore HTTP ${res.status}`,
          "err"
        );
        if (data.changes) {
          logMockupCp1.textContent = formatChanges(data.changes);
          logMockupCp1.classList.remove("hidden");
        }
        return;
      }
      setStatus(statusMockupCp1, "Update completato.", "ok");
      logMockupCp1.textContent = formatChanges(data.changes);
      logMockupCp1.classList.remove("hidden");
    } catch (e) {
      const msg =
        e instanceof TypeError && String(e.message).includes("fetch")
          ? "Impossibile contattare il server. Avvia update_dates_api_server.py o verifica l’URL Render."
          : String(e.message || e);
      setStatus(statusMockupCp1, msg, "err");
    } finally {
      mockupCp1UpdateBtn.disabled = false;
    }
  });

  async function populateVt1Screen(_doScrape) {
    try {
      setStatus(statusVt1, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultVt1Payload();
      const payload = deepClone(basePayload);
      payload.prestazione.requests[0].fields.forEach((row) => {
        if (row.field === "EXT_DATA_ESEC") row.value = todayYYYYMMDD();
      });

      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(vt1DbJson, ctx.db);
      const v = ctx.values;

      fillVt1InputsFromTop({
        documentkey: v.documentkey,
        rif_ext: v.rif_ext,
        pod: v.pod,
        extDataEsec: todayYYYYMMDD(),
        extNome: v.extNome,
        extCognome: v.extCognome,
        extRagsoc: v.extRagsoc,
        extCodFiscale: v.extCodFiscale,
      });
      applyTopFieldsToPayload(payload, collectTopFormValues());
      vt1VenditoreCache = v.venditoreCodice || "";
      applyVenditoreToPayload(payload, vt1VenditoreCache);

      const sec = await getVt1LocalForAuth();
      vt1Cookie.value = sec.vt1Cookie || "";
      vt1Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusVt1,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(vt1DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusVt1, String(e.message || e), "err");
    }
  }

  async function populateEleAv1Screen(_doScrape) {
    try {
      setStatus(statusEleAv1, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultEleAv1Payload();
      const payload = deepClone(basePayload);

      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(eleAv1DbJson, ctx.db);
      const v = ctx.values;

      fillEleAv1InputsFromTop({
        documentkey: v.documentkey,
        rif_ext: v.rif_ext,
        pod: v.pod,
        extDtDecorD: toDDMMYYYYForAv1(v.extDtDecorD) || todayDDMMYYYY(),
        extPotImp: v.extPotImp || "3.0",
        extPotDisp: v.extPotDisp || "3.30",
        extOpzTariffa: v.extOpzTariffa || "TD",
        extTensFase: v.extTensFase || "BT_MONOFASE",
      });
      applyEleAv1FieldsToPayload(payload, collectEleAv1FormValues());
      eleAv1VenditoreCache = v.venditoreCodice || "";
      applyVenditoreToPayload(payload, eleAv1VenditoreCache);

      const sec = await getVt1LocalForAuth();
      eleAv1Cookie.value = sec.vt1Cookie || "";
      eleAv1Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusEleAv1,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(eleAv1DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusEleAv1, String(e.message || e), "err");
    }
  }

  async function populateEleEs1100Screen(_doScrape) {
    try {
      setStatus(statusEleEs1100, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultEleEs1100Payload();
      const payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(eleEs1100DbJson, ctx.db);
      const v = ctx.values;
      eleEs1100VenditoreCache = v.venditoreCodice || "13V0000000";
      eleEs1100DistributoreCache =
        pickFlat(v.flat, "DISTRIBUTORE", "COD_DISTRIBUTORE", "CODICE_DISTRIBUTORE") ||
        "13D0000014";
      fillEleEs1100InputsFromTop({
        requestCode: v.requestCode,
        desEsitoVerificaAmm: "1",
        coderrAeeg: "",
        extAnnotazioni: "",
      });
      applyEleEs1100FieldsToPayload(payload, collectEleEs1100FormValues());
      const sec = await getVt1LocalForAuth();
      eleEs1100Cookie.value = sec.vt1Cookie || "";
      eleEs1100Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusEleEs1100,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(eleEs1100DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusEleEs1100, String(e.message || e), "err");
    }
  }

  async function populateEleEs1AckScreen(_doScrape) {
    try {
      setStatus(statusEleEs1Ack, "Carico dati da amc.request e dlsii_messages…", "");
      const basePayload = await loadDefaultEleEs1AckPayload();
      const payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      const v = ctx.values;
      const dlsii = await fetchDlsiiAckContextFromApi(v.requestCode);
      if (!dlsii.ok) {
        throw new Error(dlsii.error || "Impossibile leggere amc.dlsii_messages.");
      }
      setDbJsonBox(eleEs1AckDbJson, {
        amc_request: ctx.db,
        dlsii_message: dlsii.dlsii,
      });
      fillEleEs1AckInputsFromTop({
        correlationId: dlsii.correlation_id || "",
        requestCode: v.requestCode,
        codPratUtente: v.requestCode,
        codPod: v.pod || pickFlat(v.flat, "POD", "EXT_POD", "COD_POD"),
      });
      applyEleEs1AckFieldsToPayload(payload, collectEleEs1AckFormValues());
      const sec = await getVt1LocalForAuth();
      eleEs1AckCookie.value = sec.vt1Cookie || "";
      eleEs1AckJson.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusEleEs1Ack,
        `DB ok · correlation_id · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(eleEs1AckDbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusEleEs1Ack, String(e.message || e), "err");
    }
  }

  async function populateEleEs1150Screen(_doScrape) {
    try {
      setStatus(statusEleEs1150, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultEleEs1150Payload();
      const payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(eleEs1150DbJson, ctx.db);
      const v = ctx.values;
      eleEs1150VenditoreCache = v.venditoreCodice || "13V0000000";
      eleEs1150DistributoreCache =
        pickFlat(v.flat, "DISTRIBUTORE", "COD_DISTRIBUTORE", "CODICE_DISTRIBUTORE") ||
        "13D0000014";
      eleEs1150PivaDestCache =
        pickFlat(v.flat, "PIVA_DEST", "PIVA_DESTINATARIO", "PIVA_DISTRIBUTORE") ||
        "00225170687";
      const tensFaseRaw = v.extTensFase || pickFlat(v.flat, "EXT_TENS_FASE", "TENS_FASE");
      eleEs1150TensFaseCache =
        tensFaseRaw && /monof/i.test(String(tensFaseRaw))
          ? "BT Monofase"
          : tensFaseRaw || "BT Monofase";
      fillEleEs1150InputsFromTop({
        requestCode: v.requestCode,
        pod: v.pod,
        extDtDecorD: toDDMMYYYYForAv1(v.extDtDecorD) || todayDDMMYYYY(),
        codContrDisp:
          v.codContrDisp ||
          pickFlat(v.flat, "COD_CONTR_DISP", "CODICE_CONTRATTO_DISP") ||
          "",
        extNome: v.extNome || v.zNome,
        extCognome: v.extCognome || v.zCognome,
        extRagsoc: v.extRagsoc || v.zRagsoc,
        extCodFiscale: v.extCodFiscale || v.zCodiceFiscale,
        extPartitaIva: v.extPartitaIva || v.zPartitaIva,
        extPotImp: v.extPotImp || "6",
        extPotDisp: v.extPotDisp || "6.6",
        extTensAlim: v.extTensAlim || "220",
        extOpzTariffa: v.extOpzTariffa || "ETAB1I00C1",
        extTipoMisuratore: "CE",
      });
      applyEleEs1150FieldsToPayload(payload, collectEleEs1150FormValues());
      const sec = await getVt1LocalForAuth();
      eleEs1150Cookie.value = sec.vt1Cookie || "";
      eleEs1150Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusEleEs1150,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(eleEs1150DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusEleEs1150, String(e.message || e), "err");
    }
  }


  async function populateWp1Screen(_doScrape) {
    try {
      setStatus(statusWp1, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultWp1Payload();
      const payload = deepClone(basePayload);

      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(wp1DbJson, ctx.db);
      const v = ctx.values;

      fillWp1InputsFromTop({
        documentkey: v.documentkey,
        rif_ext: v.rif_ext,
        pod: v.pod,
        codPrestaz: "PV1",
        extDtDecorD:
          normalizeDateToYYYYMMDD(v.extDtDecorD) || todayYYYYMMDD(),
        extPotImp: v.extPotImp,
        extPotDisp: v.extPotDisp,
        extOpzTariffa: v.extOpzTariffa,
        extTensFase: v.extTensFase,
        extTensAlim: v.extTensAlim,
      });
      applyWp1FieldsToPayload(payload, collectWp1FormValues());
      wp1VenditoreCache = v.venditoreCodice || "";
      applyVenditoreToPayload(payload, wp1VenditoreCache);

      const sec = await getVt1LocalForAuth();
      wp1Cookie.value = sec.vt1Cookie || "";
      wp1Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusWp1,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(wp1DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusWp1, String(e.message || e), "err");
    }
  }

  scrapeAgain.addEventListener("click", async () => {
    scrapeAgain.disabled = true;
    await populateVt1Screen(true);
    scrapeAgain.disabled = false;
  });

  scrapeAgainEleAv1.addEventListener("click", async () => {
    scrapeAgainEleAv1.disabled = true;
    await populateEleAv1Screen(true);
    scrapeAgainEleAv1.disabled = false;
  });

  scrapeAgainWp1.addEventListener("click", async () => {
    scrapeAgainWp1.disabled = true;
    await populateWp1Screen(true);
    scrapeAgainWp1.disabled = false;
  });

  eleAv1Send.addEventListener("click", async () => {
    logEleAv1.classList.add("hidden");
    logEleAv1.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusEleAv1, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(eleAv1Json.value);
    } catch (e) {
      setStatus(statusEleAv1, `JSON non valido: ${e.message}`, "err");
      return;
    }

    applyEleAv1FieldsToPayload(bodyObj, collectEleAv1FormValues());
    applyVenditoreToPayload(bodyObj, eleAv1VenditoreCache);
    const bodyStr = JSON.stringify(bodyObj);
    eleAv1Json.value = JSON.stringify(bodyObj, null, 2);

    eleAv1Send.disabled = true;
    setStatus(statusEleAv1, "Invio in corso…", "");

    try {
      const endpoint = await getVt1Url();
      console.debug("[ELE AV1 150] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = eleAv1Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusEleAv1, `HTTP ${res.status}`, "err");
        logEleAv1.textContent = pretty;
        logEleAv1.classList.remove("hidden");
        return;
      }

      setStatus(statusEleAv1, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logEleAv1.textContent = pretty;
        logEleAv1.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusEleAv1, String(e.message || e), "err");
    } finally {
      eleAv1Send.disabled = false;
    }
  });


  scrapeAgainEleEs1100.addEventListener("click", async () => {
    scrapeAgainEleEs1100.disabled = true;
    await populateEleEs1100Screen(true);
    scrapeAgainEleEs1100.disabled = false;
  });

  scrapeAgainEleEs1Ack.addEventListener("click", async () => {
    scrapeAgainEleEs1Ack.disabled = true;
    await populateEleEs1AckScreen(true);
    scrapeAgainEleEs1Ack.disabled = false;
  });

  eleEs1100Send.addEventListener("click", async () => {
    logEleEs1100.classList.add("hidden");
    logEleEs1100.textContent = "";
    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusEleEs1100, authBuilt.message, "err");
      return;
    }
    let bodyObj;
    try {
      bodyObj = JSON.parse(eleEs1100Json.value);
    } catch (e) {
      setStatus(statusEleEs1100, `JSON non valido: ${e.message}`, "err");
      return;
    }
    applyEleEs1100FieldsToPayload(bodyObj, collectEleEs1100FormValues());
    const bodyStr = JSON.stringify(bodyObj);
    eleEs1100Json.value = JSON.stringify(bodyObj, null, 2);
    eleEs1100Send.disabled = true;
    setStatus(statusEleEs1100, "Invio in corso…", "");
    try {
      const endpoint = await getEleEs1100Url();
      console.debug("[ELE ES1 100] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = eleEs1100Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });
      const textRes = await res.text();
      let pretty = textRes;
      try {
        pretty = JSON.stringify(JSON.parse(textRes), null, 2);
      } catch {
        /* testo puro */
      }
      if (!res.ok) {
        setStatus(statusEleEs1100, `HTTP ${res.status}`, "err");
        logEleEs1100.textContent = pretty;
        logEleEs1100.classList.remove("hidden");
        return;
      }
      setStatus(statusEleEs1100, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logEleEs1100.textContent = pretty;
        logEleEs1100.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusEleEs1100, String(e.message || e), "err");
    } finally {
      eleEs1100Send.disabled = false;
    }
  });

  eleEs1AckSend.addEventListener("click", async () => {
    logEleEs1Ack.classList.add("hidden");
    logEleEs1Ack.textContent = "";
    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusEleEs1Ack, authBuilt.message, "err");
      return;
    }
    let bodyObj;
    try {
      bodyObj = JSON.parse(eleEs1AckJson.value);
    } catch (e) {
      setStatus(statusEleEs1Ack, `JSON non valido: ${e.message}`, "err");
      return;
    }
    const ackValues = collectEleEs1AckFormValues();
    if (!ackValues.correlationId) {
      setStatus(statusEleEs1Ack, "correlationId mancante: esegui Refresh dati.", "err");
      return;
    }
    applyEleEs1AckFieldsToPayload(bodyObj, ackValues);
    const bodyStr = JSON.stringify(bodyObj);
    eleEs1AckJson.value = JSON.stringify(bodyObj, null, 2);
    const endpoint = await getEleEs1AckUrl();
    eleEs1AckSend.disabled = true;
    setStatus(statusEleEs1Ack, "Invio in corso…", "");
    try {
      console.debug("[ELE ES1 ACK] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = eleEs1AckCookie.value.trim();
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });
      const textRes = await res.text();
      let pretty = textRes;
      try {
        pretty = JSON.stringify(JSON.parse(textRes), null, 2);
      } catch {
        /* testo puro */
      }
      if (!res.ok) {
        setStatus(statusEleEs1Ack, `HTTP ${res.status}`, "err");
        logEleEs1Ack.textContent = pretty;
        logEleEs1Ack.classList.remove("hidden");
        return;
      }
      setStatus(statusEleEs1Ack, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logEleEs1Ack.textContent = pretty;
        logEleEs1Ack.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusEleEs1Ack, String(e.message || e), "err");
    } finally {
      eleEs1AckSend.disabled = false;
    }
  });

  scrapeAgainEleEs1150.addEventListener("click", async () => {
    scrapeAgainEleEs1150.disabled = true;
    await populateEleEs1150Screen(true);
    scrapeAgainEleEs1150.disabled = false;
  });


  eleEs1150Send.addEventListener("click", async () => {
    logEleEs1150.classList.add("hidden");
    logEleEs1150.textContent = "";
    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusEleEs1150, authBuilt.message, "err");
      return;
    }
    let bodyObj;
    try {
      bodyObj = JSON.parse(eleEs1150Json.value);
    } catch (e) {
      setStatus(statusEleEs1150, `JSON non valido: ${e.message}`, "err");
      return;
    }
    applyEleEs1150FieldsToPayload(bodyObj, collectEleEs1150FormValues());
    const bodyStr = JSON.stringify(bodyObj);
    eleEs1150Json.value = JSON.stringify(bodyObj, null, 2);
    eleEs1150Send.disabled = true;
    setStatus(statusEleEs1150, "Invio in corso…", "");
    try {
      const endpoint = await getEleEs1InboundFileUrl();
      console.debug("[ELE ES1 150] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = eleEs1150Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });
      const textRes = await res.text();
      let pretty = textRes;
      try {
        pretty = JSON.stringify(JSON.parse(textRes), null, 2);
      } catch {
        /* testo puro */
      }
      if (!res.ok) {
        setStatus(statusEleEs1150, `HTTP ${res.status}`, "err");
        logEleEs1150.textContent = pretty;
        logEleEs1150.classList.remove("hidden");
        return;
      }
      setStatus(statusEleEs1150, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logEleEs1150.textContent = pretty;
        logEleEs1150.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusEleEs1150, String(e.message || e), "err");
    } finally {
      eleEs1150Send.disabled = false;
    }
  });

  vt1Send.addEventListener("click", async () => {
    logVt1.classList.add("hidden");
    logVt1.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusVt1, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(vt1Json.value);
    } catch (e) {
      setStatus(statusVt1, `JSON non valido: ${e.message}`, "err");
      return;
    }

    applyTopFieldsToPayload(bodyObj, collectTopFormValues());
    applyVenditoreToPayload(bodyObj, vt1VenditoreCache);
    const bodyStr = JSON.stringify(bodyObj);
    vt1Json.value = JSON.stringify(bodyObj, null, 2);

    vt1Send.disabled = true;
    setStatus(statusVt1, "Invio in corso…", "");

    try {
      const endpoint = await getVt1Url();
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = vt1Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusVt1, `HTTP ${res.status}`, "err");
        logVt1.textContent = pretty;
        logVt1.classList.remove("hidden");
        return;
      }

      setStatus(statusVt1, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logVt1.textContent = pretty;
        logVt1.classList.remove("hidden");
      }

      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusVt1, String(e.message || e), "err");
    } finally {
      vt1Send.disabled = false;
    }
  });

  wp1Send.addEventListener("click", async () => {
    logWp1.classList.add("hidden");
    logWp1.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusWp1, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(wp1Json.value);
    } catch (e) {
      setStatus(statusWp1, `JSON non valido: ${e.message}`, "err");
      return;
    }

    applyWp1FieldsToPayload(bodyObj, collectWp1FormValues());
    applyVenditoreToPayload(bodyObj, wp1VenditoreCache);
    const bodyStr = JSON.stringify(bodyObj);
    wp1Json.value = JSON.stringify(bodyObj, null, 2);

    wp1Send.disabled = true;
    setStatus(statusWp1, "Invio in corso…", "");

    try {
      const endpoint = await getVt1Url();
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = wp1Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusWp1, `HTTP ${res.status}`, "err");
        logWp1.textContent = pretty;
        logWp1.classList.remove("hidden");
        return;
      }

      setStatus(statusWp1, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logWp1.textContent = pretty;
        logWp1.classList.remove("hidden");
      }

      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusWp1, String(e.message || e), "err");
    } finally {
      wp1Send.disabled = false;
    }
  });

  async function populateGasA01Screen(_doScrape) {
    try {
      setStatus(statusGasA01, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultGasA01Payload();
      const payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(gasA01DbJson, ctx.db);
      const v = ctx.values;
      fillGasA01InputsFromTop({
        documentkey: v.documentkey,
        rif_ext: v.rif_ext,
        // Per GAS preferisci PDR / COD_PDR rispetto a POD
        codPdr:
          pickFlat(v.flat, "PDR", "COD_PDR", "CODICE_PDR", "POD") || v.pod,
      });
      applyGasA01FieldsToPayload(payload, collectGasA01FormValues());
      gasA01VenditoreCache = v.venditoreCodice || "";
      applyVenditoreToPayload(payload, gasA01VenditoreCache);
      const sec = await getVt1LocalForAuth();
      gasA01Cookie.value = sec.vt1Cookie || "";
      gasA01Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusGasA01,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(gasA01DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusGasA01, String(e.message || e), "err");
    }
  }

  scrapeAgainGasA01.addEventListener("click", async () => {
    scrapeAgainGasA01.disabled = true;
    await populateGasA01Screen(true);
    scrapeAgainGasA01.disabled = false;
  });


  gasA01Send.addEventListener("click", async () => {
    logGasA01.classList.add("hidden");
    logGasA01.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusGasA01, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(gasA01Json.value);
    } catch (e) {
      setStatus(statusGasA01, `JSON non valido: ${e.message}`, "err");
      return;
    }

    applyGasA01FieldsToPayload(bodyObj, collectGasA01FormValues());
    applyVenditoreToPayload(bodyObj, gasA01VenditoreCache);
    const bodyStr = JSON.stringify(bodyObj);
    gasA01Json.value = JSON.stringify(bodyObj, null, 2);

    gasA01Send.disabled = true;
    setStatus(statusGasA01, "Invio in corso…", "");

    try {
      const endpoint = await getVt1Url();
      console.debug("[GAS A01 100] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = gasA01Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusGasA01, `HTTP ${res.status}`, "err");
        logGasA01.textContent = pretty;
        logGasA01.classList.remove("hidden");
        return;
      }

      setStatus(statusGasA01, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logGasA01.textContent = pretty;
        logGasA01.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusGasA01, String(e.message || e), "err");
    } finally {
      gasA01Send.disabled = false;
    }
  });

  async function populateGasA01150Screen(_doScrape) {
    try {
      setStatus(statusGasA01150, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultGasA01150Payload();
      const payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(gasA01150DbJson, ctx.db);
      const v = ctx.values;
      fillGasA01150InputsFromTop({
        documentkey: v.documentkey,
        rif_ext: v.rif_ext,
        codPdr:
          pickFlat(v.flat, "PDR", "COD_PDR", "CODICE_PDR", "POD") || v.pod,
        extDataEsec:
          normalizeDateToYYYYMMDD(v.extDataEsec) || todayYYYYMMDD(),
      });
      applyGasA01150FieldsToPayload(payload, collectGasA01150FormValues());
      gasA01150VenditoreCache = v.venditoreCodice || "";
      applyVenditoreToPayload(payload, gasA01150VenditoreCache);
      const sec = await getVt1LocalForAuth();
      gasA01150Cookie.value = sec.vt1Cookie || "";
      gasA01150Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusGasA01150,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(gasA01150DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusGasA01150, String(e.message || e), "err");
    }
  }

  async function populateGasVtg150Screen(_doScrape) {
    try {
      setStatus(statusGasVtg150, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultGasVtg150Payload();
      const payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(gasVtg150DbJson, ctx.db);
      const v = ctx.values;
      fillGasVtg150InputsFromTop({
        documentkey: v.documentkey,
        rif_ext: v.rif_ext,
        pod: pickFlat(v.flat, "PDR", "COD_PDR", "CODICE_PDR", "POD") || v.pod,
        extDataEsec:
          normalizeDateToYYYYMMDD(v.extDataEsec) || todayYYYYMMDD(),
        desEsitoAttivita: "1",
        extCoderrAeeg: "",
        extAnnotazioni: "",
        zNome: v.zNome || v.extNome,
        zCognome: v.zCognome || v.extCognome,
        zRagsoc: v.zRagsoc || v.extRagsoc,
        zCodiceFiscale: v.zCodiceFiscale || v.extCodFiscale,
        zPartitaIva: v.zPartitaIva || v.extPartitaIva,
        zCfStraniero: pickFlat(v.flat, "Z_CF_STRANIERO", "CF_STRANIERO") || "",
      });
      applyGasVtg150FieldsToPayload(payload, collectGasVtg150FormValues());
      gasVtg150VenditoreCache = v.venditoreCodice || "";
      applyVenditoreToPayload(payload, gasVtg150VenditoreCache);
      const sec = await getVt1LocalForAuth();
      gasVtg150Cookie.value = sec.vt1Cookie || "";
      gasVtg150Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusGasVtg150,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(gasVtg150DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusGasVtg150, String(e.message || e), "err");
    }
  }

  scrapeAgainGasA01150.addEventListener("click", async () => {
    scrapeAgainGasA01150.disabled = true;
    await populateGasA01150Screen(true);
    scrapeAgainGasA01150.disabled = false;
  });

  scrapeAgainGasVtg150.addEventListener("click", async () => {
    scrapeAgainGasVtg150.disabled = true;
    await populateGasVtg150Screen(true);
    scrapeAgainGasVtg150.disabled = false;
  });

  gasVtg150Send.addEventListener("click", async () => {
    logGasVtg150.classList.add("hidden");
    logGasVtg150.textContent = "";
    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusGasVtg150, authBuilt.message, "err");
      return;
    }
    let bodyObj;
    try {
      bodyObj = JSON.parse(gasVtg150Json.value);
    } catch (e) {
      setStatus(statusGasVtg150, `JSON non valido: ${e.message}`, "err");
      return;
    }
    applyGasVtg150FieldsToPayload(bodyObj, collectGasVtg150FormValues());
    applyVenditoreToPayload(bodyObj, gasVtg150VenditoreCache);
    const bodyStr = JSON.stringify(bodyObj);
    gasVtg150Json.value = JSON.stringify(bodyObj, null, 2);
    gasVtg150Send.disabled = true;
    setStatus(statusGasVtg150, "Invio in corso…", "");
    try {
      const endpoint = await getVt1Url();
      console.debug("[GAS VTG 150] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = gasVtg150Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(endpoint, { method: "POST", headers, body: bodyStr });
      const textRes = await res.text();
      let pretty = textRes;
      try {
        pretty = JSON.stringify(JSON.parse(textRes), null, 2);
      } catch {
        /* testo puro */
      }
      if (!res.ok) {
        setStatus(statusGasVtg150, `HTTP ${res.status}`, "err");
        logGasVtg150.textContent = pretty;
        logGasVtg150.classList.remove("hidden");
        return;
      }
      setStatus(statusGasVtg150, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logGasVtg150.textContent = pretty;
        logGasVtg150.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusGasVtg150, String(e.message || e), "err");
    } finally {
      gasVtg150Send.disabled = false;
    }
  });


  gasA01150Send.addEventListener("click", async () => {
    logGasA01150.classList.add("hidden");
    logGasA01150.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusGasA01150, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(gasA01150Json.value);
    } catch (e) {
      setStatus(statusGasA01150, `JSON non valido: ${e.message}`, "err");
      return;
    }

    applyGasA01150FieldsToPayload(bodyObj, collectGasA01150FormValues());
    applyVenditoreToPayload(bodyObj, gasA01150VenditoreCache);
    const bodyStr = JSON.stringify(bodyObj);
    gasA01150Json.value = JSON.stringify(bodyObj, null, 2);

    gasA01150Send.disabled = true;
    setStatus(statusGasA01150, "Invio in corso…", "");

    try {
      const endpoint = await getVt1Url();
      console.debug("[GAS A01 150] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = gasA01150Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusGasA01150, `HTTP ${res.status}`, "err");
        logGasA01150.textContent = pretty;
        logGasA01150.classList.remove("hidden");
        return;
      }

      setStatus(statusGasA01150, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logGasA01150.textContent = pretty;
        logGasA01150.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusGasA01150, String(e.message || e), "err");
    } finally {
      gasA01150Send.disabled = false;
    }
  });

  async function populateSg1Screen(_doScrape) {
    try {
      setStatus(statusSg1, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultSg1Payload();
      const payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(sg1DbJson, ctx.db);
      const v = ctx.values;
      fillSg1InputsFromTop({
        documentkey: v.documentkey,
        rif_ext: v.rif_ext,
        pod: pickFlat(v.flat, "PDR", "COD_PDR", "CODICE_PDR", "POD") || v.pod,
        zNome: v.zNome,
        zCognome: v.zCognome,
        zRagsoc: v.zRagsoc,
        zCodiceFiscale: v.zCodiceFiscale,
        zPartitaIva: v.zPartitaIva,
        extSernr: v.extSernr,
        extZztipoc: v.extZztipoc || "G4",
        extCodClasse: v.extCodClasse || "C2X1",
        extCabinaRemi: v.extCabinaRemi,
      });
      applySg1FieldsToPayload(payload, collectSg1FormValues());
      sg1VenditoreCache = v.venditoreCodice || "";
      applyVenditoreToPayload(payload, sg1VenditoreCache);
      const sec = await getVt1LocalForAuth();
      sg1Cookie.value = sec.vt1Cookie || "";
      sg1Json.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusSg1,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(sg1DbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusSg1, String(e.message || e), "err");
    }
  }

  scrapeAgainSg1.addEventListener("click", async () => {
    scrapeAgainSg1.disabled = true;
    await populateSg1Screen(true);
    scrapeAgainSg1.disabled = false;
  });


  sg1Send.addEventListener("click", async () => {
    logSg1.classList.add("hidden");
    logSg1.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusSg1, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(sg1Json.value);
    } catch (e) {
      setStatus(statusSg1, `JSON non valido: ${e.message}`, "err");
      return;
    }

    applySg1FieldsToPayload(bodyObj, collectSg1FormValues());
    applyVenditoreToPayload(bodyObj, sg1VenditoreCache);
    const bodyStr = JSON.stringify(bodyObj);
    sg1Json.value = JSON.stringify(bodyObj, null, 2);

    sg1Send.disabled = true;
    setStatus(statusSg1, "Invio in corso…", "");

    try {
      const endpoint = await getVt1Url();
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = sg1Cookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusSg1, `HTTP ${res.status}`, "err");
        logSg1.textContent = pretty;
        logSg1.classList.remove("hidden");
        return;
      }

      setStatus(statusSg1, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logSg1.textContent = pretty;
        logSg1.classList.remove("hidden");
      }

      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusSg1, String(e.message || e), "err");
    } finally {
      sg1Send.disabled = false;
    }
  });

  async function populateSg1DtmsScreen(_doScrape) {
    try {
      setStatus(statusSg1Dtms, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultSg1DtmsPayload();
      let payload = deepClone(basePayload);
      payload = applySg1DtmsTodayDates(payload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(sg1DtmsDbJson, ctx.db);
      const v = ctx.values;
      fillSg1DtmsInputsFromTop({
        requestId: v.requestId,
        pod: pickFlat(v.flat, "PDR", "COD_PDR", "CODICE_PDR", "POD") || v.pod,
        rif_ext: v.rif_ext,
        extSernr: v.extSernr,
        extVolAnnSost: pickFlat(v.flat, "EXT_VOL_ANN_SOST", "VOL_ANN_SOST"),
        zLettSernrSost: pickFlat(v.flat, "Z_LETT_SERNR_SOST", "LETT_SERNR_SOST"),
        zLettSernrEff: pickFlat(v.flat, "Z_LETT_SERNR_EFF", "LETT_SERNR_EFF"),
      });
      payload = applySg1DtmsFieldsToPayload(payload, collectSg1DtmsFormValues());
      const sec = await getVt1LocalForAuth();
      sg1DtmsCookie.value = sec.vt1Cookie || "";
      sg1DtmsJson.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusSg1Dtms,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(sg1DtmsDbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusSg1Dtms, String(e.message || e), "err");
    }
  }

  scrapeAgainSg1Dtms.addEventListener("click", async () => {
    scrapeAgainSg1Dtms.disabled = true;
    await populateSg1DtmsScreen(true);
    scrapeAgainSg1Dtms.disabled = false;
  });


  sg1DtmsSend.addEventListener("click", async () => {
    logSg1Dtms.classList.add("hidden");
    logSg1Dtms.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusSg1Dtms, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(sg1DtmsJson.value);
    } catch (e) {
      setStatus(statusSg1Dtms, `JSON non valido: ${e.message}`, "err");
      return;
    }

    bodyObj = applySg1DtmsFieldsToPayload(bodyObj, collectSg1DtmsFormValues());
    if (bodyObj.requestId == null || String(bodyObj.requestId).trim() === "") {
      setStatus(statusSg1Dtms, "requestId obbligatorio nel body.", "err");
      return;
    }
    const bodyStr = JSON.stringify(bodyObj);
    sg1DtmsJson.value = JSON.stringify(bodyObj, null, 2);

    sg1DtmsSend.disabled = true;
    setStatus(statusSg1Dtms, "Invio send-esiti…", "");
    console.debug("[SG1 DTMS] POST only (canale_com gestito a mano)");

    try {
      const endpoint = await getSendEsitiUrl();
      console.debug("[SG1 DTMS] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = sg1DtmsCookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusSg1Dtms, `HTTP ${res.status}`, "err");
        logSg1Dtms.textContent = pretty;
        logSg1Dtms.classList.remove("hidden");
        return;
      }

      setStatus(statusSg1Dtms, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logSg1Dtms.textContent = pretty;
        logSg1Dtms.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusSg1Dtms, String(e.message || e), "err");
    } finally {
      sg1DtmsSend.disabled = false;
    }
  });

  async function populateGasA01DtecScreen(_doScrape) {
    try {
      setStatus(statusGasA01Dtec, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultGasA01DtecPayload();
      let payload = deepClone(basePayload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(gasA01DtecDbJson, ctx.db);
      const v = ctx.values;
      fillGasA01DtecInputsFromTop({
        requestId: v.requestId,
        pod: pickFlat(v.flat, "PDR", "COD_PDR", "CODICE_PDR", "POD") || v.pod,
        zNome: v.zNome,
        zCognome: v.zCognome,
        zRagsoc: v.zRagsoc,
        zCodiceFiscale: v.zCodiceFiscale,
        zPartitaIva: v.zPartitaIva,
        extSernr: v.extSernr,
        extZztipoc: v.extZztipoc || "G4",
        extCodClasse: v.extCodClasse || "1",
        extCabinaRemi: v.extCabinaRemi,
      });
      // telefono se presente in flat
      const tel = v.zTel;
      if (tel) {
        const f = payload.fields.find((x) => x.field === "Z_TEL");
        if (f) f.value = tel;
      }
      payload = applyGasA01DtecFieldsToPayload(payload, collectGasA01DtecFormValues());
      const sec = await getVt1LocalForAuth();
      gasA01DtecCookie.value = sec.vt1Cookie || "";
      gasA01DtecJson.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusGasA01Dtec,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(gasA01DtecDbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusGasA01Dtec, String(e.message || e), "err");
    }
  }

  scrapeAgainGasA01Dtec.addEventListener("click", async () => {
    scrapeAgainGasA01Dtec.disabled = true;
    await populateGasA01DtecScreen(true);
    scrapeAgainGasA01Dtec.disabled = false;
  });


  gasA01DtecSend.addEventListener("click", async () => {
    logGasA01Dtec.classList.add("hidden");
    logGasA01Dtec.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusGasA01Dtec, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(gasA01DtecJson.value);
    } catch (e) {
      setStatus(statusGasA01Dtec, `JSON non valido: ${e.message}`, "err");
      return;
    }

    bodyObj = applyGasA01DtecFieldsToPayload(bodyObj, collectGasA01DtecFormValues());
    if (bodyObj.requestId == null || String(bodyObj.requestId).trim() === "") {
      setStatus(statusGasA01Dtec, "requestId obbligatorio nel body.", "err");
      return;
    }
    const bodyStr = JSON.stringify(bodyObj);
    gasA01DtecJson.value = JSON.stringify(bodyObj, null, 2);

    gasA01DtecSend.disabled = true;
    setStatus(statusGasA01Dtec, "Invio send-esiti…", "");
    console.debug("[GAS A01 DTEC] POST only → send-esiti");

    try {
      const endpoint = await getSendEsitiUrl();
      console.debug("[GAS A01 DTEC] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = gasA01DtecCookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusGasA01Dtec, `HTTP ${res.status}`, "err");
        logGasA01Dtec.textContent = pretty;
        logGasA01Dtec.classList.remove("hidden");
        return;
      }

      setStatus(statusGasA01Dtec, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logGasA01Dtec.textContent = pretty;
        logGasA01Dtec.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusGasA01Dtec, String(e.message || e), "err");
    } finally {
      gasA01DtecSend.disabled = false;
    }
  });

  async function populateSe1DtecScreen(_doScrape) {
    try {
      setStatus(statusSe1Dtec, "Carico dati da amc.request…", "");
      const basePayload = await loadDefaultSe1DtecPayload();
      let payload = deepClone(basePayload);
      payload = applySe1DtecTodayDates(payload);
      const ctx = await loadRequestContextForFlow();
      setDbJsonBox(se1DtecDbJson, ctx.db);
      const v = ctx.values;
      fillSe1DtecInputsFromTop({
        requestId: v.requestId,
        pod: v.pod,
        rif_ext: v.rif_ext,
        codContrDisp: v.codContrDisp || "DP4119",
        extSernr: v.extSernr,
        extPotImp: v.extPotImp,
        extPotDisp: v.extPotDisp,
        extOpzTariffa: v.extOpzTariffa || "BTA4",
        extTensAlim: v.extTensAlim || "220",
        zPuntoDisp: v.zPuntoDisp || "NORD",
      });
      payload = applySe1DtecFieldsToPayload(payload, collectSe1DtecFormValues());
      const sec = await getVt1LocalForAuth();
      se1DtecCookie.value = sec.vt1Cookie || "";
      se1DtecJson.value = JSON.stringify(payload, null, 2);
      setStatus(
        statusSe1Dtec,
        `Dati da DB · id_request=${v.id_request ?? "—"} · ${v.requestCode}`,
        "ok"
      );
    } catch (e) {
      setDbJsonBox(se1DtecDbJson, { ok: false, error: String(e.message || e) });
      setStatus(statusSe1Dtec, String(e.message || e), "err");
    }
  }

  scrapeAgainSe1Dtec.addEventListener("click", async () => {
    scrapeAgainSe1Dtec.disabled = true;
    await populateSe1DtecScreen(true);
    scrapeAgainSe1Dtec.disabled = false;
  });


  se1DtecSend.addEventListener("click", async () => {
    logSe1Dtec.classList.add("hidden");
    logSe1Dtec.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusSe1Dtec, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(se1DtecJson.value);
    } catch (e) {
      setStatus(statusSe1Dtec, `JSON non valido: ${e.message}`, "err");
      return;
    }

    bodyObj = applySe1DtecFieldsToPayload(bodyObj, collectSe1DtecFormValues());
    if (bodyObj.requestId == null || String(bodyObj.requestId).trim() === "") {
      setStatus(statusSe1Dtec, "requestId obbligatorio nel body.", "err");
      return;
    }
    const bodyStr = JSON.stringify(bodyObj);
    se1DtecJson.value = JSON.stringify(bodyObj, null, 2);

    se1DtecSend.disabled = true;
    setStatus(statusSe1Dtec, "Invio send-esiti…", "");
    console.debug("[SE1 DTEC] POST only");

    try {
      const endpoint = await getSendEsitiUrl();
      console.debug("[SE1 DTEC] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = se1DtecCookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusSe1Dtec, `HTTP ${res.status}`, "err");
        logSe1Dtec.textContent = pretty;
        logSe1Dtec.classList.remove("hidden");
        return;
      }

      setStatus(statusSe1Dtec, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logSe1Dtec.textContent = pretty;
        logSe1Dtec.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusSe1Dtec, String(e.message || e), "err");
    } finally {
      se1DtecSend.disabled = false;
    }
  });

  function syncBatchApnFormFromPayload(payload) {
    batchApnRunId.value = payload.runId || "";
    batchApnBatchType.value = payload.batchType || "MS_083";
    batchApnVariant.value =
      payload.dlSiiVariantCode != null ? String(payload.dlSiiVariantCode) : "";
    batchApnJson.value = JSON.stringify(payload, null, 2);
  }

  async function populateBatchApnScreen() {
    const payload = buildBatchApnPayload();
    syncBatchApnFormFromPayload(payload);
    const sec = await getVt1LocalForAuth();
    batchApnCookie.value = sec.vt1Cookie || "";
    setStatus(
      statusBatchApn,
      `Pronto · runId con data ${todayYYYYMMDD()}.`,
      "ok"
    );
  }

  batchApnRefreshDates.addEventListener("click", () => {
    const payload = buildBatchApnPayload({
      batchType: batchApnBatchType.value.trim() || "MS_083",
      dlSiiVariantCode: batchApnVariant.value,
    });
    syncBatchApnFormFromPayload(payload);
    setStatus(statusBatchApn, `runId aggiornato: ${payload.runId}`, "ok");
  });


  batchApnSend.addEventListener("click", async () => {
    logBatchApn.classList.add("hidden");
    logBatchApn.textContent = "";

    const authLocal = await getVt1LocalForAuth();
    const authBuilt = buildVt1AuthorizationHeader(authLocal);
    if (!authBuilt.ok) {
      setStatus(statusBatchApn, authBuilt.message, "err");
      return;
    }

    let bodyObj;
    try {
      bodyObj = JSON.parse(batchApnJson.value);
    } catch (e) {
      setStatus(statusBatchApn, `JSON non valido: ${e.message}`, "err");
      return;
    }

    // Allinea campi form → body; se runId vuoto, rigenera con data odierna
    bodyObj = buildBatchApnPayload({
      runId: batchApnRunId.value.trim() || bodyObj.runId,
      batchType: batchApnBatchType.value.trim() || bodyObj.batchType || "MS_083",
      dlSiiVariantCode:
        batchApnVariant.value !== undefined
          ? batchApnVariant.value
          : bodyObj.dlSiiVariantCode,
    });
    if (!bodyObj.runId) {
      bodyObj = buildBatchApnPayload({
        batchType: bodyObj.batchType,
        dlSiiVariantCode: bodyObj.dlSiiVariantCode,
      });
    }
    syncBatchApnFormFromPayload(bodyObj);
    const bodyStr = JSON.stringify(bodyObj);

    batchApnSend.disabled = true;
    setStatus(statusBatchApn, "Invio batch…", "");
    console.debug("[Batch APN] body=", bodyObj);

    try {
      const endpoint = await getBatchInvokeUrl();
      console.debug("[Batch APN] POST", endpoint);
      const headers = {
        "Content-Type": "application/json",
        Authorization: authBuilt.value,
      };
      const cookie = batchApnCookie.value.trim();
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* testo puro */
      }

      if (!res.ok) {
        setStatus(statusBatchApn, `HTTP ${res.status}`, "err");
        logBatchApn.textContent = pretty;
        logBatchApn.classList.remove("hidden");
        return;
      }

      setStatus(statusBatchApn, `OK · HTTP ${res.status}`, "ok");
      if (pretty) {
        logBatchApn.textContent = pretty;
        logBatchApn.classList.remove("hidden");
      }
      await chrome.storage.local.set({ vt1Cookie: cookie });
    } catch (e) {
      setStatus(statusBatchApn, String(e.message || e), "err");
    } finally {
      batchApnSend.disabled = false;
    }
  });

  /**
   * Aggiorna il textarea JSON quando si modificano gli input della schermata.
   * Esclude cookie, DbJson e il textarea JSON stesso.
   * In digitazione: sync silenzioso; sul pulsante Apply: sync + messaggio.
   */
  function wireLiveJsonSync({
    screenId,
    jsonEl,
    applyBtn,
    syncFn,
  }) {
    const screen = document.getElementById(screenId);
    if (!screen || !jsonEl || typeof syncFn !== "function") return;

    const onFieldEdit = () => {
      try {
        syncFn({ announce: false });
      } catch (e) {
        /* ignore errori di parse durante digitazione */
      }
    };
    screen.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el === jsonEl) return;
      const id = el.id || "";
      if (
        id.endsWith("DbJson") ||
        id.endsWith("Json") ||
        id.endsWith("Cookie")
      ) {
        return;
      }
      el.addEventListener("input", onFieldEdit);
      el.addEventListener("change", onFieldEdit);
    });

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        try {
          syncFn({ announce: true });
        } catch (e) {
          /* syncFn gestisce status dove previsto */
        }
      });
    }
  }

  function syncJsonFromFields(jsonEl, applyFn, statusEl, okMsg, opts) {
    const announce = !!(opts && opts.announce);
    let payload;
    try {
      payload = JSON.parse(jsonEl.value);
    } catch (e) {
      if (announce && statusEl) {
        setStatus(statusEl, `JSON non valido: ${e.message}`, "err");
      }
      throw e;
    }
    const next = applyFn(payload);
    jsonEl.value = JSON.stringify(next == null ? payload : next, null, 2);
    if (announce && statusEl && okMsg) setStatus(statusEl, okMsg, "ok");
  }

  wireLiveJsonSync({
    screenId: "screenVt1",
    jsonEl: vt1Json,
    applyBtn: vt1ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        vt1Json,
        (p) => {
          applyTopFieldsToPayload(p, collectTopFormValues());
          applyVenditoreToPayload(p, vt1VenditoreCache);
          return p;
        },
        statusVt1,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenEleAv1",
    jsonEl: eleAv1Json,
    applyBtn: eleAv1ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        eleAv1Json,
        (p) => {
          applyEleAv1FieldsToPayload(p, collectEleAv1FormValues());
          applyVenditoreToPayload(p, eleAv1VenditoreCache);
          return p;
        },
        statusEleAv1,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenWp1",
    jsonEl: wp1Json,
    applyBtn: wp1ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        wp1Json,
        (p) => {
          applyWp1FieldsToPayload(p, collectWp1FormValues());
          applyVenditoreToPayload(p, wp1VenditoreCache);
          return p;
        },
        statusWp1,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenEleEs1100",
    jsonEl: eleEs1100Json,
    applyBtn: eleEs1100ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        eleEs1100Json,
        (p) => applyEleEs1100FieldsToPayload(p, collectEleEs1100FormValues()),
        statusEleEs1100,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenEleEs1150",
    jsonEl: eleEs1150Json,
    applyBtn: eleEs1150ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        eleEs1150Json,
        (p) => applyEleEs1150FieldsToPayload(p, collectEleEs1150FormValues()),
        statusEleEs1150,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenEleEs1Ack",
    jsonEl: eleEs1AckJson,
    applyBtn: eleEs1AckApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        eleEs1AckJson,
        (p) => applyEleEs1AckFieldsToPayload(p, collectEleEs1AckFormValues()),
        statusEleEs1Ack,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenGasA01",
    jsonEl: gasA01Json,
    applyBtn: gasA01ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        gasA01Json,
        (p) => {
          applyGasA01FieldsToPayload(p, collectGasA01FormValues());
          applyVenditoreToPayload(p, gasA01VenditoreCache);
          return p;
        },
        statusGasA01,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenGasVtg150",
    jsonEl: gasVtg150Json,
    applyBtn: gasVtg150ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        gasVtg150Json,
        (p) => {
          applyGasVtg150FieldsToPayload(p, collectGasVtg150FormValues());
          applyVenditoreToPayload(p, gasVtg150VenditoreCache);
          return p;
        },
        statusGasVtg150,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenGasA01150",
    jsonEl: gasA01150Json,
    applyBtn: gasA01150ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        gasA01150Json,
        (p) => {
          applyGasA01150FieldsToPayload(p, collectGasA01150FormValues());
          applyVenditoreToPayload(p, gasA01150VenditoreCache);
          return p;
        },
        statusGasA01150,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenSg1",
    jsonEl: sg1Json,
    applyBtn: sg1ApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        sg1Json,
        (p) => {
          applySg1FieldsToPayload(p, collectSg1FormValues());
          applyVenditoreToPayload(p, sg1VenditoreCache);
          return p;
        },
        statusSg1,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenSg1Dtms",
    jsonEl: sg1DtmsJson,
    applyBtn: sg1DtmsApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        sg1DtmsJson,
        (p) => applySg1DtmsFieldsToPayload(p, collectSg1DtmsFormValues()),
        statusSg1Dtms,
        "JSON aggiornato (date = oggi).",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenGasA01Dtec",
    jsonEl: gasA01DtecJson,
    applyBtn: gasA01DtecApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        gasA01DtecJson,
        (p) => applyGasA01DtecFieldsToPayload(p, collectGasA01DtecFormValues()),
        statusGasA01Dtec,
        "JSON aggiornato dai campi.",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenSe1Dtec",
    jsonEl: se1DtecJson,
    applyBtn: se1DtecApplyFields,
    syncFn: (opts) =>
      syncJsonFromFields(
        se1DtecJson,
        (p) => applySe1DtecFieldsToPayload(p, collectSe1DtecFormValues()),
        statusSe1Dtec,
        "JSON aggiornato (EXT_DT_DECOR_D = oggi).",
        opts
      ),
  });

  wireLiveJsonSync({
    screenId: "screenBatchApn",
    jsonEl: batchApnJson,
    applyBtn: batchApnApplyFields,
    syncFn: (opts) => {
      const payload = buildBatchApnPayload({
        runId: batchApnRunId.value.trim(),
        batchType: batchApnBatchType.value.trim() || "MS_083",
        dlSiiVariantCode: batchApnVariant.value,
      });
      syncBatchApnFormFromPayload(payload);
      if (opts && opts.announce) {
        setStatus(statusBatchApn, "JSON aggiornato dai campi.", "ok");
      }
    },
  });
});
