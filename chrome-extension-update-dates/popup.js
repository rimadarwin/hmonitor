/** Base API senza :porta su Render (HTTPS = 443). Per locale usa Impostazioni → 127.0.0.1:8765. */
const DEFAULT_API = "https://hmonitor-uhk9.onrender.com";
const DEFAULT_VT1_URL =
  "https://gh-manage-co-dev-int-a0c1c0ddf5f3.herokuapp.com/dlsii/inboundflow";

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function getApiBase() {
  const { apiBaseUrl } = await chrome.storage.sync.get({
    apiBaseUrl: DEFAULT_API,
  });
  return (apiBaseUrl || DEFAULT_API).replace(/\/+$/, "");
}

async function getVt1Url() {
  const { vt1InboundUrl } = await chrome.storage.sync.get({
    vt1InboundUrl: DEFAULT_VT1_URL,
  });
  return (vt1InboundUrl || DEFAULT_VT1_URL).trim();
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

  return {
    documentkey,
    pod: getField("POD"),
    rif_ext: getField("Codice Pratica SII"),
    extNome: getField("Nome"),
    extCognome: getField("Cognome"),
    extRagsoc: getField("Ragione Sociale"),
    extCodFiscale: getField("Codice Fiscale"),
    venditoreCodice: parseVenditoreCodice(getField("Venditore")),
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
      "venditoreCodice",
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
    extCodFiscale: t(raw.extCodFiscale),
    venditoreCodice: t(raw.venditoreCodice),
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
    row.value = "058776110032";
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
    .map(
      (c) =>
        `[${c.tabella}] ${c.campo}\n  prima: ${c.vecchio}\n  dopo:  ${c.nuovo}`
    )
    .join("\n\n");
}

function showScreen(name) {
  const home = document.getElementById("screenHome");
  const dates = document.getElementById("screenDates");
  const vt1 = document.getElementById("screenVt1");
  home.classList.toggle("hidden", name !== "home");
  dates.classList.toggle("hidden", name !== "dates");
  vt1.classList.toggle("hidden", name !== "vt1");
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

  const goDates = document.getElementById("goDates");
  const goVt1 = document.getElementById("goVt1");
  const requestCode = document.getElementById("requestCode");
  const runBtn = document.getElementById("runBtn");
  const statusDates = document.getElementById("statusDates");
  const logDates = document.getElementById("logDates");
  const backFromDates = document.getElementById("backFromDates");

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
  const vt1Json = document.getElementById("vt1Json");
  const vt1ApplyFields = document.getElementById("vt1ApplyFields");
  const vt1Send = document.getElementById("vt1Send");
  const statusVt1 = document.getElementById("statusVt1");
  const logVt1 = document.getElementById("logVt1");
  const backFromVt1 = document.getElementById("backFromVt1");

  wireOpenOptions(
    document.getElementById("openOptionsHome"),
    document.getElementById("openOptionsDates"),
    document.getElementById("openOptionsVt1"),
    document.getElementById("openOptionsVt1Auth")
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

  goVt1.addEventListener("click", async () => {
    showScreen("vt1");
    logVt1.classList.add("hidden");
    logVt1.textContent = "";
    setStatus(statusVt1, "Caricamento…", "");
    await populateVt1Screen(true);
  });

  backFromDates.addEventListener("click", () => showScreen("home"));
  backFromVt1.addEventListener("click", () => showScreen("home"));

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

      setStatus(statusDates, "Operazione completata.", "ok");
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

  async function populateVt1Screen(doScrape) {
    try {
      const basePayload = await loadDefaultVt1Payload();
      const payload = deepClone(basePayload);
      payload.prestazione.requests[0].fields.forEach((row) => {
        if (row.field === "EXT_DATA_ESEC") row.value = todayYYYYMMDD();
      });

      const emptyScrape = {
        documentkey: "",
        pod: "",
        rif_ext: "",
        extNome: "",
        extCognome: "",
        extRagsoc: "",
        extCodFiscale: "",
        venditoreCodice: "",
      };
      let scraped = { ...emptyScrape };
      let scrapeOk = false;
      let scrapeErr = null;
      if (doScrape) {
        try {
          scraped = await scrapeFromActiveTab();
          scrapeOk = true;
        } catch (err) {
          scrapeErr = err;
        }
      }

      if (scraped.documentkey) {
        const f = payload.prestazione.requests[0].fields.find(
          (x) => x.field === "DOCUMENTKEY"
        );
        if (f) f.value = scraped.documentkey;
      }
      if (scraped.rif_ext) {
        const f = payload.prestazione.requests[0].fields.find(
          (x) => x.field === "RIF_EXT"
        );
        if (f) f.value = scraped.rif_ext;
      }
      if (scraped.pod) {
        const f = payload.prestazione.requests[0].fields.find(
          (x) => x.field === "POD"
        );
        if (f) f.value = scraped.pod;
      }

      if (scrapeOk) {
        const pairs = [
          ["EXT_NOME", scraped.extNome],
          ["EXT_COGNOME", scraped.extCognome],
          ["EXT_RAGSOC", scraped.extRagsoc],
          ["EXT_COD_FISCALE", scraped.extCodFiscale],
        ];
        for (const [field, val] of pairs) {
          const f = payload.prestazione.requests[0].fields.find(
            (x) => x.field === field
          );
          if (f) f.value = val == null ? "" : String(val);
        }
      }

      if (scrapeOk) {
        vt1VenditoreCache = scraped.venditoreCodice || "";
      }
      applyVenditoreToPayload(payload, scraped.venditoreCodice);

      const top = readTopFieldsFromPayload(payload);
      fillVt1InputsFromTop(top);

      const sec = await getVt1LocalForAuth();
      vt1Cookie.value = sec.vt1Cookie || "";

      vt1Json.value = JSON.stringify(payload, null, 2);

      if (scrapeErr) {
        const em = String(scrapeErr.message || scrapeErr);
        const extra =
          /cannot access|access.*host|permission|denied|blocked/i.test(em)
            ? " Concedi all’estensione l’accesso al sito (Chrome → estensione → permessi sito) oppure ricarica l’estensione."
            : "";
        setStatus(statusVt1, em + extra, "err");
      } else {
        const any = !!(
          scraped.documentkey ||
          scraped.pod ||
          scraped.rif_ext ||
          scraped.extNome ||
          scraped.extCognome ||
          scraped.extRagsoc ||
          scraped.extCodFiscale ||
          scraped.venditoreCodice
        );
        const hint = any
          ? "Campi aggiornati dalla pagina. Controlla Authorization nelle impostazioni e invia."
          : "Nessun dato letto dal tab (selettori non trovati). Compila a mano o riprova dal dettaglio richiesta.";
        setStatus(statusVt1, hint, any ? "ok" : "err");
      }
    } catch (e) {
      setStatus(statusVt1, String(e.message || e), "err");
    }
  }

  scrapeAgain.addEventListener("click", async () => {
    scrapeAgain.disabled = true;
    setStatus(statusVt1, "Lettura pagina…", "");
    try {
      const scraped = await scrapeFromActiveTab();
      vt1Documentkey.value = scraped.documentkey || vt1Documentkey.value;
      vt1RifExt.value = scraped.rif_ext || vt1RifExt.value;
      vt1Pod.value = scraped.pod || vt1Pod.value;
      vt1Nome.value = scraped.extNome;
      vt1Cognome.value = scraped.extCognome;
      vt1Ragsoc.value = scraped.extRagsoc;
      vt1Cf.value = scraped.extCodFiscale;
      let payload;
      try {
        payload = JSON.parse(vt1Json.value);
      } catch {
        payload = await loadDefaultVt1Payload();
      }
      applyTopFieldsToPayload(payload, collectTopFormValues());
      if (scraped.venditoreCodice) vt1VenditoreCache = scraped.venditoreCodice;
      applyVenditoreToPayload(payload, scraped.venditoreCodice);
      vt1Json.value = JSON.stringify(payload, null, 2);
      setStatus(statusVt1, "Lettura completata.", "ok");
    } catch (e) {
      setStatus(statusVt1, String(e.message || e), "err");
    } finally {
      scrapeAgain.disabled = false;
    }
  });

  vt1ApplyFields.addEventListener("click", () => {
    try {
      const payload = JSON.parse(vt1Json.value);
      applyTopFieldsToPayload(payload, collectTopFormValues());
      applyVenditoreToPayload(payload, vt1VenditoreCache);
      vt1Json.value = JSON.stringify(payload, null, 2);
      setStatus(statusVt1, "JSON aggiornato dai campi.", "ok");
    } catch (e) {
      setStatus(statusVt1, `JSON non valido: ${e.message}`, "err");
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
});
