# DatasetFactory

Lokalna aplikacja do przygotowania datasetu OCR z nagran gameplay. Backend
FastAPI i frontend Vite dzialaja tylko na loopbacku; workspace, cache i runtime
OCR pozostaja na dysku `D:`.

## Wymagania

- Windows 10/11 i PowerShell 5.1 lub nowszy;
- Git;
- Python 3.12 dostepny dla `uv`;
- `uv` dostepne jako polecenie;
- Node.js `>=22.22.0` z `npm` (w tym srodowisku: `C:\Program Files\nodejs`);
- portable FFmpeg/ffprobe oraz zweryfikowany dev-only Tesseract na sciezkach
  wskazanych w `.env`. Zalecany layout znajduje sie w `.env.example`.

Skrypty nie instaluja narzedzi globalnie i nie zmieniaja systemowego `PATH`.

## Pierwsze uruchomienie z pustego checkoutu

Checkout trzymaj na `D:`, na przyklad `D:\my\Projects\DatasetFactory`:

```powershell
Set-Location D:\my\Projects
git clone <adres-repozytorium> DatasetFactory
Set-Location .\DatasetFactory
Copy-Item .env.example .env
notepad .env
```

W `.env` ustaw rzeczywiste sciezki do FFmpeg, ffprobe, Tesseracta i modelu.
Pozostaw `DF_WORKSPACE_DIR`, `DF_CACHE_DIR`, Tesseracta i model na `D:`. Sumy
`DF_TESSERACT_RUNTIME_SHA256` i `DF_TESSERACT_MODEL_SHA256` musza odpowiadac
lokalnym plikom.

Nastepnie wykonaj:

```powershell
.\scripts\bootstrap.ps1
.\scripts\dev.ps1
```

`bootstrap.ps1` tworzy lokalne `.venv`, instaluje wersje z `uv.lock` i
`frontend/package-lock.json`, umieszcza cache na `D:` i instaluje przegladarke
Playwright do cache projektu. Wykrywa istniejacy FFmpeg/Tesseract, ale nie
instaluje ich ponownie ani globalnie. Aplikacja jest dostepna pod
`http://127.0.0.1:5173`; `Ctrl+C` konczy backend i frontend.

## Jedna bramka jakosci

Po bootstrapie uruchom z katalogu repozytorium:

```powershell
.\scripts\check.ps1
```

Skrypt wykonuje kolejno backend format/lint/typy/testy, frontend typy/testy/build,
Playwright oraz osobna bramke `npm run test:e2e-root`. Zatrzymuje sie na pierwszym
bledzie i zawsze drukuje podsumowanie. Pelny `pytest` moze trwac okolo 30 minut.

Codzienna obsluga, lokalizacje danych i diagnostyka: [docs/RUNBOOK.md](docs/RUNBOOK.md).
