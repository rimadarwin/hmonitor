/**
 * @author Maurizio di Sabato <maurizio.disabato@xcconsulting.it>
 * @description Recupero e mapping dati da amc.request (API /request-data) per i body dei flussi
 * @modified 23.09.2026 - MDS | Flatten input + mapping campi comuni (POD/PDR, RIF_EXT, potenze, ecc.)
 */

/** Chiama POST /request-data sul server Flask/Render. */
async function fetchRequestDataFromApi(requestCode) {
  const code = (requestCode || "").trim();
  if (!code) {
    return { ok: false, error: "Codice richiesta mancante." };
  }
  const base = await getApiBase();
  const res = await fetch(`${base}/request-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_code: code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      request_code: code,
      error:
        data.error ||
        data.message ||
        `request-data HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    request_code: data.request_code || code,
    id_request: data.id_request,
    input: data.input,
  };
}

/**
 * Appiattisce l'input amc.request (Key/Value, Fields, oggetti annidati)
 * in una mappa UPPERCASE → valore stringa.
 */
function flattenAmcInput(input) {
  const map = {};
  const setVal = (k, v) => {
    if (k == null) return;
    const key = String(k).trim().toUpperCase();
    if (!key) return;
    if (v == null) return;
    if (typeof v === "object") return;
    const s = String(v).trim();
    if (s === "") return;
    // Non sovrascrivere se già presente (primo trovato vince)
    if (map[key] == null || map[key] === "") map[key] = s;
  };

  const walk = (node, depth) => {
    if (node == null || depth > 12) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object") {
          const k =
            item.Key ?? item.key ?? item.field ?? item.Field ?? item.nome_campo;
          const v =
            item.Value ?? item.value ?? item.valore ?? item.Valore;
          if (k != null && (typeof v !== "object" || v === null)) {
            setVal(k, v);
          } else {
            walk(item, depth + 1);
          }
        }
      }
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (v != null && typeof v === "object") {
          walk(v, depth + 1);
        } else {
          setVal(k, v);
        }
      }
    }
  };

  walk(input, 0);
  return map;
}

/** Prende il primo valore non vuoto tra alias. */
function pickFlat(flat, ...aliases) {
  if (!flat) return "";
  for (const a of aliases) {
    const v = flat[String(a).toUpperCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Valori comuni ricavati da id_request + input appiattito + request_code.
 * Usati dai form/payload dei vari flussi.
 */
function buildCommonValuesFromDb(dbResult, requestCodeFallback) {
  const code = (dbResult?.request_code || requestCodeFallback || "").trim();
  const flat = flattenAmcInput(dbResult?.input);
  const idReq = dbResult?.id_request;

  const pod = pickFlat(
    flat,
    "POD",
    "PDR",
    "COD_PDR",
    "EXT_POD",
    "CODICE_POD",
    "CODICE_PDR"
  );
  const rifExt = pickFlat(
    flat,
    "RIF_EXT",
    "CODICE_PRATICA_SII",
    "COD_PRATICA_SII",
    "CODICE_PRATICA_DISTRIBUTORE",
    "COD_PRATICA_DISTRIBUTORE",
    "CODICE_PRATICA_DISTR",
    "COD_PRATICA_DISTR",
    "CP_DISTRIBUTORE",
    "NUM_PRATICA_DISTR",
    "CODICE_PRATICA",
    "COD_PRATICA"
  );
  const documentkey = pickFlat(flat, "DOCUMENTKEY", "NUMERO_RICHIESTA") || code;

  return {
    requestCode: code,
    id_request: idReq != null ? idReq : null,
    requestId: idReq != null ? String(idReq) : "",
    documentkey,
    pod,
    codPdr: pod,
    rif_ext: rifExt,
    zNome: pickFlat(flat, "Z_NOME", "NOME", "EXT_NOME"),
    zCognome: pickFlat(flat, "Z_COGNOME", "COGNOME", "EXT_COGNOME"),
    zRagsoc: pickFlat(
      flat,
      "Z_RAGSOC",
      "RAGSOC",
      "EXT_RAGSOC",
      "RAGIONE_SOCIALE"
    ),
    zCodiceFiscale: pickFlat(
      flat,
      "Z_CODICE_FISCALE",
      "CODICE_FISCALE",
      "EXT_COD_FISCALE",
      "EXT_COD_FISCALE",
      "CF"
    ),
    zPartitaIva: pickFlat(
      flat,
      "Z_PARTITA_IVA",
      "PARTITA_IVA",
      "PIVA",
      "EXT_PARTITA_IVA"
    ),
    zTel: pickFlat(flat, "Z_TEL", "TEL", "TELEFONO", "CELLULARE"),
    extNome: pickFlat(flat, "EXT_NOME", "NOME", "Z_NOME"),
    extCognome: pickFlat(flat, "EXT_COGNOME", "COGNOME", "Z_COGNOME"),
    extRagsoc: pickFlat(flat, "EXT_RAGSOC", "RAGSOC", "Z_RAGSOC"),
    extCodFiscale: pickFlat(
      flat,
      "EXT_COD_FISCALE",
      "CODICE_FISCALE",
      "Z_CODICE_FISCALE",
      "CF"
    ),
    extSernr: pickFlat(
      flat,
      "EXT_SERNR",
      "SERNR",
      "MATRICOLA",
      "NUMERO_SERIE",
      "EXT_MATR"
    ),
    extZztipoc: pickFlat(flat, "EXT_ZZTIPOC", "ZZTIPOC", "TIPO_CONTATORE"),
    extCodClasse: pickFlat(flat, "EXT_COD_CLASSE", "COD_CLASSE"),
    extCabinaRemi: pickFlat(flat, "EXT_CABINA_REMI", "CABINA_REMI", "REMI"),
    extPotImp: pickFlat(
      flat,
      "EXT_POT_IMP",
      "POT_IMP",
      "POTENZA_IMPEGNATA",
      "POT_IMPEGNATA"
    ),
    extPotDisp: pickFlat(
      flat,
      "EXT_POT_DISP",
      "POT_DISP",
      "POTENZA_DISPONIBILE",
      "POT_DISPONIBILE"
    ),
    extTensFase: pickFlat(flat, "EXT_TENS_FASE", "TENS_FASE", "TENSIONE_FASE"),
    extTensAlim: pickFlat(flat, "EXT_TENS_ALIM", "TENS_ALIM", "TENSIONE_ALIM"),
    extOpzTariffa: pickFlat(
      flat,
      "EXT_OPZ_TARIFFA",
      "OPZ_TARIFFA",
      "OPZIONE_TARIFFARIA"
    ),
    codContrDisp: pickFlat(
      flat,
      "COD_CONTR_DISP",
      "CODICE_CONTRATTO_DISP",
      "COD_CONTRATTO"
    ),
    zPuntoDisp: pickFlat(
      flat,
      "Z_PUNTODISPACCIAMENTO",
      "PUNTO_DISPACCIAMENTO",
      "PUNTODISP"
    ),
    extDtDecorD: pickFlat(
      flat,
      "EXT_DT_DECOR_D",
      "DT_DECRICHIESTA",
      "DATA_DECORRENZA",
      "DATA_DECORR"
    ),
    extDataEsec: pickFlat(flat, "EXT_DATA_ESEC", "DATA_ESEC", "DATA_ESECUZIONE"),
    venditoreCodice: (() => {
      const raw = pickFlat(
        flat,
        "VENDITORE",
        "CODICE_VENDITORE",
        "COD_VENDITORE",
        "EXT_VENDITORE"
      );
      if (!raw) return "";
      const m = raw.match(/^([0-9A-Z]+)\s*[-–—]/i);
      if (m) return m[1].trim();
      return raw.split(/\s+-\s+/)[0].trim();
    })(),
    flat,
  };
}

/** Mostra nel textarea il JSON leggibile con id_request + input. */
function setDbJsonBox(textareaEl, dbResult) {
  if (!textareaEl) return;
  if (!dbResult || !dbResult.ok) {
    textareaEl.value = dbResult?.error
      ? JSON.stringify({ error: dbResult.error }, null, 2)
      : "";
    return;
  }
  textareaEl.value = JSON.stringify(
    {
      id_request: dbResult.id_request,
      request_code: dbResult.request_code,
      input: dbResult.input,
    },
    null,
    2
  );
}

/**
 * Legge il codice richiesta dal tab (DOCUMENTKEY) e carica amc.request.
 * Ritorna { code, db, values } oppure lancia Error.
 */
async function loadRequestContextForFlow() {
  let code = "";
  try {
    const scraped = await scrapeFromActiveTab();
    code = (scraped.documentkey || "").trim();
  } catch (e) {
    /* tab non accessibile: code resta vuoto */
  }
  if (!code) {
    throw new Error(
      "Codice richiesta non trovato nel tab. Apri il dettaglio richiesta e riprova."
    );
  }
  const db = await fetchRequestDataFromApi(code);
  if (!db.ok) {
    throw new Error(db.error || "Impossibile leggere amc.request.");
  }
  const values = buildCommonValuesFromDb(db, code);
  return { code, db, values, scraped: null };
}
