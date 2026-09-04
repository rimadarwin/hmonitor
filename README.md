# ScriptHerokuHera — operazioni Hera (avanzamento pratiche)

API Flask + estensione Chrome per operazioni su richieste Hera: aggiornamento date su PostgreSQL e invio flussi VT1/WP1 verso DLSII.

**Produzione:** [https://hmonitor-uhk9.onrender.com](https://hmonitor-uhk9.onrender.com)  
**Repository GitHub:** [https://github.com/rimadarwin/hmonitor](https://github.com/rimadarwin/hmonitor)

> Lo stub `GET /partners/leads` (Lepas/Omoda) è stato spostato nel progetto sibling **`ScriptPartnersLeads`**.

---

## Panoramica componenti

| Componente | Ruolo | Dove gira |
|---|---|---|
| `update_dates_api_server.py` | Server HTTP Flask (route API) | Render |
| `update_request_dates.py` | Logica aggiornamento date su DB | Importato dal server |
| `chrome-extension-update-dates/` | Side panel Chrome: date, VT1, WP1 | Browser (non su Render) |
| PostgreSQL (`amc.*`) | Database richieste | Heroku Postgres |

---

## Legame GitHub ↔ Render

1. Push su branch `main` → Render avvia build e deploy automatico.
2. Render legge `Procfile` e avvia:
   ```text
   gunicorn update_dates_api_server:app --bind 0.0.0.0:$PORT ...
   ```
3. `app.py` è uno shim WSGI; l’app reale è in `update_dates_api_server.py`.

```bash
git add .
git commit -m "descrizione modifica"
git push origin main
```

---

## Deploy su Render

### Variabili d’ambiente

Configurazione: **servizio hmonitor → Environment**.

| Variabile | Obbligatoria | Note |
|---|---|---|
| `DATABASE_URL` | Sì (per `/update`) | Connection string PostgreSQL |
| `PORT` | No | **Non impostare manualmente** su Render |

### Verifica deploy

```http
GET https://hmonitor-uhk9.onrender.com/health
```

---

## Sviluppo locale

```bash
pip install -r requirements.txt
cp .env.example .env
# Compila DATABASE_URL
python update_dates_api_server.py
```

Server locale: `http://127.0.0.1:8765`

---

## API

### `GET /health`

Health check (senza autenticazione).

### `POST /update`

Usato dall’estensione Chrome per aggiornare le date di una richiesta.

```json
{ "request_code": "V00000030814" }
```

---

## Estensione Chrome (`chrome-extension-update-dates/`)

| Flusso | Endpoint | Auth |
|---|---|---|
| Aggiorna date | `POST {apiBaseUrl}/update` su Render | Nessuna |
| VT1 ELE 150 | `POST` su Heroku DLSII inboundflow | Bearer/Basic + cookie |
| WP1 ELE 150 | Stesso endpoint VT1 | Stesse credenziali VT1 |

Default API date: `https://hmonitor-uhk9.onrender.com`

Dopo modifiche: `chrome://extensions` → **Ricarica**.

---

## Struttura repository

```text
app.py
update_dates_api_server.py
update_request_dates.py
chrome-extension-update-dates/
Procfile
requirements.txt
runtime.txt
.env.example
```

## Progetto correlato (non Hera)

Risorse Lepas/Omoda e utility PDF: cartella sibling `../ScriptPartnersLeads`.
