# hmonitor — API operazioni Hera

Monolite Python (Flask) + estensione Chrome per operazioni su richieste Hera: aggiornamento date su PostgreSQL, invio flussi VT1/WP1 verso DLSII, e endpoint stub per integrazioni partner (`/partners/leads`).

**Produzione:** [https://hmonitor-uhk9.onrender.com](https://hmonitor-uhk9.onrender.com)  
**Repository GitHub:** [https://github.com/rimadarwin/hmonitor](https://github.com/rimadarwin/hmonitor)

---

## Panoramica componenti

| Componente | Ruolo | Dove gira |
|---|---|---|
| `update_dates_api_server.py` | Server HTTP Flask (route API) | Render |
| `update_request_dates.py` | Logica aggiornamento date su DB | Importato dal server |
| `partners_leads.py` | Stub GET `/partners/leads` (compatibilità Lepas/Omoda) | Importato dal server |
| `chrome-extension-update-dates/` | Side panel Chrome: date, VT1, WP1 | Browser (non su Render) |
| PostgreSQL (`amc.*`) | Database richieste Heroku | Heroku Postgres |

L’estensione Chrome **non** chiama `/partners/leads`. Quel endpoint è pensato per sistemi esterni server-to-server (es. Salesforce).

---

## Legame GitHub ↔ Render

Il deploy su Render è collegato al repository GitHub:

1. Push su branch `main` → Render avvia build e deploy automatico.
2. Render legge `Procfile` e avvia:
   ```text
   gunicorn update_dates_api_server:app --bind 0.0.0.0:$PORT ...
   ```
3. `app.py` è uno shim WSGI; l’app reale è in `update_dates_api_server.py`.

**Flusso tipico di rilascio:**

```bash
git add .
git commit -m "descrizione modifica"
git push origin main
```

Poi attendere il deploy nella dashboard Render (sezione **Events** / **Logs** del servizio `hmonitor`).

---

## Deploy su Render

### Prerequisiti

- Account Render con Web Service collegato al repo `rimadarwin/hmonitor`
- Branch di deploy: `main`
- Runtime Python: `3.12.8` (da `runtime.txt`)
- Build command: di solito `pip install -r requirements.txt` (default Render)

### Variabili d’ambiente (dashboard Render)

Configurazione: **servizio hmonitor → Environment** (tab *Environment* nel menu laterale, come da screenshot).

> **Non committare mai** il file `.env` locale. Le variabili di produzione vivono solo su Render.

| Variabile | Obbligatoria | Note |
|---|---|---|
| `DATABASE_URL` | Sì (per `/update`) | Connection string PostgreSQL Heroku |
| `PARTNERS_LEADS_API_KEY` | Sì (per `/partners/leads`) | Stessa chiave usata dal sistema chiamante in header `x-oj-api-key` |
| `PARTNERS_LEADS_CHANNEL` | No | Default: `Lepas` |
| `PARTNERS_LEADS_TOTAL` | No | **Importante:** per lo stub a 1 record usare `1`. Valori alti fanno paginare il sistema chiamante |
| `PARTNERS_LEADS_DEFAULT_LOCATION_ID` | No | UUID concessionaria (default CARPOINT Pomezia) |
| `PARTNERS_LEADS_DEFAULT_FIRST_NAME` | No | Default contatto: `stefano` |
| `PARTNERS_LEADS_DEFAULT_LAST_NAME` | No | Default contatto: `sampietro` |
| `PARTNERS_LEADS_DEFAULT_EMAIL` | No | Default email stub |
| `PORT` | No | **Non impostare manualmente** su Render: la piattaforma la assegna |

Dopo ogni modifica alle variabili, Render riavvia il servizio.

### Verifica deploy

```http
GET https://hmonitor-uhk9.onrender.com/health
```

Risposta attesa: `{"status":"ok","service":"update-request-dates"}`

---

## Sviluppo locale

### Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# Compila .env con DATABASE_URL e, se serve, PARTNERS_LEADS_*
python update_dates_api_server.py
```

Server locale: `http://127.0.0.1:8765` (porta configurabile con `UPDATE_DATES_API_PORT`).

### `.env` locale vs Render

| Ambiente | Dove configurare |
|---|---|
| Locale | File `.env` (copia da `.env.example`) |
| Render | Dashboard → **Environment** |

Le due configurazioni sono **indipendenti**: cambiare `.env` in locale non aggiorna Render, e viceversa.

---

## API esposte dal backend

### `GET /health`

Health check (senza autenticazione).

### `POST /update`

Usato dall’estensione Chrome per aggiornare le date di una richiesta su PostgreSQL.

```json
{ "request_code": "V00000030814" }
```

Richiede `DATABASE_URL` configurata.

### `GET /partners/leads`

Stub server-to-server, compatibile con chiamate stile Lepas/Omoda.

**Autenticazione** (almeno uno):

- `x-oj-api-key: <chiave>`
- `X-Internal-Api-Key: <chiave>`
- `Authorization: Bearer <chiave>`

**Query param minimi** (esempio Postman):

| Param | Esempio |
|---|---|
| `page` | `1` |
| `limit` | `1` |
| `status` | `VALID` |
| `type` | `SALES` |

URL completo di esempio:

```text
https://hmonitor-uhk9.onrender.com/partners/leads?page=1&limit=1&status=VALID&type=SALES
```

Se `baseUrl` in Postman è `https://hmonitor-uhk9.onrender.com/partners`, la path è `/leads`.

**Accortezza su `PARTNERS_LEADS_TOTAL`:** lo stub restituisce **un solo lead** in `data`, ma il campo `total` guida la paginazione del sistema chiamante. Se `total` è `40` o `2316`, il consumer può effettuare molte GET e importare più record (ogni chiamata genera ID nuovi). Per un flusso a record singolo: **`PARTNERS_LEADS_TOTAL=1`**.

Parametri opzionali aggiuntivi: `external_id`, `location_id`, `first_name`, `last_name`, `email`, `phone`, `vehicle_make`, `vehicle_model`, `campaign_name`, ecc.

---

## Estensione Chrome (`chrome-extension-update-dates/`)

Non viene deployata su Render: si carica in Chrome come estensione non pacchettizzata (o pacchetto interno).

### Flussi attuali

| Flusso | Endpoint | Auth |
|---|---|---|
| Aggiorna date | `POST {apiBaseUrl}/update` su Render | Nessuna (API aperta) |
| VT1 ELE 150 | `POST` su Heroku DLSII inboundflow | Bearer/Basic + cookie (lato browser) |
| WP1 ELE 150 | Stesso endpoint VT1 | Stesse credenziali VT1 |

Default in codice:

- API date: `https://hmonitor-uhk9.onrender.com`
- Inbound DLSII: `https://gh-manage-co-dev-int-a0c1c0ddf5f3.herokuapp.com/dlsii/inboundflow`

Configurabili dal pannello **Impostazioni** dell’estensione (`options.html`).

### Aggiornare l’estensione dopo modifiche

1. Modificare i file in `chrome-extension-update-dates/`
2. In Chrome: `chrome://extensions` → **Ricarica** sull’estensione
3. Eventualmente aggiornare `version` in `manifest.json`

Le modifiche all’estensione **non** richiedono push su Render, salvo quando cambia anche il backend.

---

## Come estendere il progetto

### Pattern backend (nuove API)

Il progetto segue una struttura piatta e ripetibile:

1. **Route** in `update_dates_api_server.py` (`@app.get` / `@app.post`)
2. **Logica** in un modulo dedicato (es. `partners_leads.py`, `update_request_dates.py`)
3. **Variabili** documentate in `.env.example` e configurate su Render → Environment
4. Aggiornare la lista `paths` in `GET /`

Esempio per un nuovo endpoint interno:

```python
# nuovo_modulo.py
def run_nuova_operazione(args) -> Result: ...

# update_dates_api_server.py
@app.get("/nuovo/endpoint")
def nuovo_endpoint():
    ...
```

### Nuovi flussi nell’estensione Chrome

Per aggiungere un flusso operativo (es. un nuovo tipo inbound):

1. Aggiungere schermata in `popup.html` / logica in `popup.js`
2. Creare un `*-default-payload.json` se serve un template JSON
3. Se il flusso chiama un’API esterna: configurare URL e auth in `options.js` / `auth-config.js`
4. Aggiornare `manifest.json` (`version`, eventuali `host_permissions`)
5. Se serve persistenza o logica server: aggiungere route Flask dedicata (non mescolare con stub partner)

### Separazione responsabilità

| Tipo integrazione | Dove implementare |
|---|---|
| Tool operatore (browser) | Estensione Chrome + eventuale nuova route su Render |
| Integrazione batch / CRM / ERP | Nuovo modulo backend su Render, con auth server-to-server |
| Flussi SAP/DLSII esistenti | Restano su Heroku `gh-manage-co-dev-int` (repo esterno) |

### Checklist prima di andare in produzione

- [ ] Variabili Render aggiornate e coerenti con il sistema chiamante
- [ ] `PARTNERS_LEADS_TOTAL` allineato al numero reale di record attesi dallo stub
- [ ] Push su `main` e deploy Render completato senza errori nei log
- [ ] Test `GET /health` e smoke test dell’endpoint modificato
- [ ] Se toccata l’estensione: ricaricata in Chrome e provata sul dettaglio richiesta Hera
- [ ] `.env` non tracciato da git (solo `.env.example`)

---

## Test

```bash
# Stub partner leads
python test_partners_leads.py

# Aggiornamento date (richiede DATABASE_URL)
python update_request_dates.py
```

---

## Struttura repository (sintesi)

```text
app.py                          # Shim WSGI per gunicorn
update_dates_api_server.py      # Flask app e route HTTP
update_request_dates.py         # Logica DB date richiesta
partners_leads.py               # Stub GET /partners/leads
partners_leads_facilities.json  # Mapping location_id → concessionaria
chrome-extension-update-dates/  # Estensione Chrome MV3
Procfile                        # Comando avvio Render
requirements.txt
runtime.txt
.env.example                    # Template variabili (senza segreti)
```

---

## Note operative

- **Cold start Render:** il piano free può impiegare alcuni secondi alla prima richiesta dopo idle.
- **CORS:** attualmente aperto (`*`). Per endpoint solo server-to-server non è un problema; valutare restrizioni se si espongono API al browser.
- **`POST /update` senza auth:** oggi è pubblico. Valutare protezione se l’URL diventa noto.
- **Stub `/partners/leads`:** non persiste dati; ogni GET genera risposta mock con ID nuovi. Non sostituisce l’API Omoda reale in produzione senza ulteriori adeguamenti.
