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
- portable FFmpeg/ffprobe na sciezkach wskazanych w `.env`;
- opcjonalnie Tesseract zainstalowany przez operatora. Pakiet nie zawiera jego
  binarki ani modelu; bez niego aplikacja dziala jawnie w stanie zdegradowanym
  bez realnego OCR (TD-015).

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

W `.env` ustaw rzeczywiste sciezki do FFmpeg i ffprobe; te wartosci sa jedynym
zrodlem prawdy rowniez dla realnego E2E. Pozostaw `DF_WORKSPACE_DIR` i
`DF_CACHE_DIR` na `D:`. Jesli operator dostarcza Tesseracta, jego sciezki musza
byc na `D:`, a `DF_TESSERACT_RUNTIME_SHA256` i
`DF_TESSERACT_MODEL_SHA256` musza odpowiadac lokalnym plikom.

Nastepnie wykonaj:

```powershell
.\scripts\bootstrap.ps1
.\scripts\dev.ps1
```

`bootstrap.ps1` tworzy lokalne `.venv`, instaluje wersje z `uv.lock` i
`frontend/package-lock.json`, umieszcza cache na `D:` i instaluje przegladarke
Playwright do cache projektu. Wykrywa istniejacy FFmpeg oraz opcjonalnego
Tesseracta, ale nie instaluje ich ponownie ani globalnie. Brak Tesseracta jest
ostrzezeniem, nie bledem bootstrapu. Aplikacja deweloperska jest dostepna pod
`http://127.0.0.1:5173`; `Ctrl+C` konczy backend i frontend.

## Tryb spakowany lokalnie

Po bootstrapie uruchom:

```powershell
.\scripts\package-local.ps1
```

Skrypt buduje SPA, sprawdza, ze wynik nie zawiera binarki ani modelu OCR, a
nastepnie uruchamia FastAPI pod `http://127.0.0.1:8000`. Ten jeden adres obsluguje
API, assety i trasy React; serwer Vite nie jest uruchamiany. Brak Tesseracta nie
blokuje startu: Dashboard pokazuje status `Ograniczony` i diagnostyke TD-015.

## Jedna bramka jakosci

Po bootstrapie uruchom z katalogu repozytorium:

```powershell
.\scripts\check.ps1
```

Skrypt wykonuje kolejno backend format/lint/typy/testy, frontend typy/testy/build,
Playwright oraz osobna bramke `npm run test:e2e-root`. Zatrzymuje sie na pierwszym
bledzie i zawsze drukuje podsumowanie. Pelny `pytest` trwa okolo 5 minut na
zweryfikowanej maszynie deweloperskiej.

Codzienna obsluga, lokalizacje danych i diagnostyka: [docs/RUNBOOK.md](docs/RUNBOOK.md).
