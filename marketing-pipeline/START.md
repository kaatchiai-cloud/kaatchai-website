# Starting the Marketing Pipeline

## Quick Start

```bash
bash /Users/praveen/Desktop/stori/marketing-pipeline/start.sh
```

Then open: **http://localhost:8080/marketing-pipeline/index.html**

---

## What's Running

| Process | Port | Purpose |
|---|---|---|
| Kling proxy | 3004 | Relays Kling API calls (bypasses CORS) |
| File server | 8080 | Serves the HTML app |

---

## After System Restart

Run the startup script again:

```bash
bash /Users/praveen/Desktop/stori/marketing-pipeline/start.sh
```

Press **Ctrl+C** to stop both servers.

---

## Check if Already Running

```bash
lsof -i :3004 -i :8080 | grep LISTEN
```

Both ports should show up before opening the app.

---

## Auto-start on Login (optional)

Add `start.sh` to **System Settings → General → Login Items** to run it automatically on every boot.
