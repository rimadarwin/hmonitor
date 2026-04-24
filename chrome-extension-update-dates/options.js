const DEFAULT_API = "https://hmonitor-uhk9.onrender.com";
const DEFAULT_VT1_URL =
  "https://gh-manage-co-dev-int-a0c1c0ddf5f3.herokuapp.com/dlsii/inboundflow";

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
  const vt1InboundUrl = document.getElementById("vt1InboundUrl");
  const vt1AuthScheme = document.getElementById("vt1AuthScheme");
  const vt1BearerToken = document.getElementById("vt1BearerToken");
  const vt1BasicUser = document.getElementById("vt1BasicUser");
  const vt1BasicPassword = document.getElementById("vt1BasicPassword");
  const vt1Cookie = document.getElementById("vt1Cookie");
  const save = document.getElementById("save");
  const saved = document.getElementById("saved");

  const syncVals = await chrome.storage.sync.get({
    apiBaseUrl: DEFAULT_API,
    vt1InboundUrl: DEFAULT_VT1_URL,
  });
  apiBaseUrl.value = (syncVals.apiBaseUrl || DEFAULT_API).replace(/\/+$/, "");
  vt1InboundUrl.value = (syncVals.vt1InboundUrl || DEFAULT_VT1_URL).trim();

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
    let vt1 = vt1InboundUrl.value.trim() || DEFAULT_VT1_URL;

    await chrome.storage.sync.set({
      apiBaseUrl: api,
      vt1InboundUrl: vt1,
    });

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
