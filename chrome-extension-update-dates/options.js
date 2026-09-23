const DEFAULT_API = "https://hmonitor-uhk9.onrender.com";
/** Base Heroku senza path: i flussi aggiungono /dlsii/inboundflow o /managecomunication/send-esiti */
const DEFAULT_HEROKU_BASE =
  "https://gh-manage-co-dev-int-a0c1c0ddf5f3.herokuapp.com";
const LEGACY_VT1_URL =
  "https://gh-manage-co-dev-int-a0c1c0ddf5f3.herokuapp.com/dlsii/inboundflow";

function normalizeHerokuBase(raw) {
  let u = (raw || "").trim().replace(/\/+$/, "");
  if (!u) return DEFAULT_HEROKU_BASE;
  // Migrazione da URL completo legacy (…/dlsii/inboundflow)
  u = u.replace(/\/dlsii\/inboundflow\/?$/i, "");
  u = u.replace(/\/managecomunication\/send-esiti\/?$/i, "");
  u = u.replace(/\/batch\/invoke\/?$/i, "");
  return u.replace(/\/+$/, "") || DEFAULT_HEROKU_BASE;
}

function toggleAuthBlocks(scheme) {
  const bearer = document.getElementById("vt1BearerBlock");
  const basic = document.getElementById("vt1BasicBlock");
  const isBasic = scheme === "basic";
  bearer.classList.toggle("hidden", isBasic);
  basic.classList.toggle("hidden", !isBasic);
}

function migrateLegacyAuthorization(local) {
  const legacy = (local.vt1Authorization || "").trim();
  if (!legacy) return null;
  if (local.vt1BearerToken || local.vt1BasicUser) return null;

  if (/^bearer\s+/i.test(legacy)) {
    return {
      vt1AuthScheme: "bearer",
      vt1BearerToken: legacy.replace(/^bearer\s+/i, "").trim(),
    };
  }
  if (/^basic\s+/i.test(legacy)) {
    return {
      vt1AuthScheme: "basic",
      vt1BasicUser: "",
      vt1BasicPassword: "",
    };
  }
  return {
    vt1AuthScheme: "bearer",
    vt1BearerToken: legacy,
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  const apiBaseUrl = document.getElementById("apiBaseUrl");
  const herokuBaseUrl = document.getElementById("herokuBaseUrl");
  const vt1AuthScheme = document.getElementById("vt1AuthScheme");
  const vt1BearerToken = document.getElementById("vt1BearerToken");
  const vt1BasicUser = document.getElementById("vt1BasicUser");
  const vt1BasicPassword = document.getElementById("vt1BasicPassword");
  const vt1Cookie = document.getElementById("vt1Cookie");
  const save = document.getElementById("save");
  const saved = document.getElementById("saved");

  const syncVals = await chrome.storage.sync.get({
    apiBaseUrl: DEFAULT_API,
    herokuBaseUrl: "",
    vt1InboundUrl: "",
  });
  apiBaseUrl.value = (syncVals.apiBaseUrl || DEFAULT_API).replace(/\/+$/, "");

  const migratedBase = normalizeHerokuBase(
    syncVals.herokuBaseUrl || syncVals.vt1InboundUrl || DEFAULT_HEROKU_BASE
  );
  herokuBaseUrl.value = migratedBase;

  const localVals = await chrome.storage.local.get({
    vt1AuthScheme: "bearer",
    vt1BearerToken: "",
    vt1BasicUser: "",
    vt1BasicPassword: "",
    vt1Cookie: "",
    vt1Authorization: "",
  });

  const migrated = migrateLegacyAuthorization(localVals);
  if (migrated) {
    if (migrated.vt1AuthScheme) localVals.vt1AuthScheme = migrated.vt1AuthScheme;
    if (migrated.vt1BearerToken != null) localVals.vt1BearerToken = migrated.vt1BearerToken;
    if (migrated.vt1BasicUser != null) localVals.vt1BasicUser = migrated.vt1BasicUser;
    if (migrated.vt1BasicPassword != null) localVals.vt1BasicPassword = migrated.vt1BasicPassword;
  }

  vt1AuthScheme.value =
    localVals.vt1AuthScheme === "basic" ? "basic" : "bearer";
  vt1BearerToken.value = localVals.vt1BearerToken || "";
  vt1BasicUser.value = localVals.vt1BasicUser || "";
  vt1BasicPassword.value = localVals.vt1BasicPassword || "";
  vt1Cookie.value = localVals.vt1Cookie || "";

  toggleAuthBlocks(vt1AuthScheme.value);

  vt1AuthScheme.addEventListener("change", () => {
    toggleAuthBlocks(vt1AuthScheme.value);
  });

  save.addEventListener("click", async () => {
    let api = apiBaseUrl.value.trim() || DEFAULT_API;
    api = api.replace(/\/+$/, "");
    const heroku = normalizeHerokuBase(
      herokuBaseUrl.value.trim() || DEFAULT_HEROKU_BASE
    );

    await chrome.storage.sync.set({
      apiBaseUrl: api,
      herokuBaseUrl: heroku,
    });
    // Pulisce la chiave legacy se presente
    await chrome.storage.sync.remove(["vt1InboundUrl"]);

    const scheme = vt1AuthScheme.value === "basic" ? "basic" : "bearer";
    await chrome.storage.local.set({
      vt1AuthScheme: scheme,
      vt1BearerToken: vt1BearerToken.value.trim(),
      vt1BasicUser: vt1BasicUser.value.trim(),
      vt1BasicPassword: vt1BasicPassword.value,
      vt1Cookie: vt1Cookie.value.trim(),
    });

    await chrome.storage.local.remove(["vt1Authorization"]);

    saved.textContent = "Salvato.";
    setTimeout(() => {
      saved.textContent = "";
    }, 2500);
  });
});
