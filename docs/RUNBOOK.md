# DatasetFactory - runbook lokalny

## Codzienny start i zatrzymanie

Z katalogu checkoutu:

```powershell
.\scripts\dev.ps1
```

Backend dziala pod `http://127.0.0.1:8000`, frontend pod
`http://127.0.0.1:5173`. Zakoncz przez `Ctrl+C`; skrypt sprzata oba drzewa
procesow, wlacznie z procesami potomnymi uvicorn/Vite.

Pelna lokalna bramka:

```powershell
.\scripts\check.ps1
```

Kolejnosc jest stala: `ruff format --check`, `ruff check`, `python -m mypy`,
`pytest`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`,
`npm run test:e2e-root`. Pierwsza czerwona bramka zatrzymuje przebieg, a
podsumowanie wskazuje blad i liczbe pominietych bramek.

## Layout na D:

Wartosci sa konfigurowane w `.env`; ponizsze sciezki to domyslny layout:

| Zasob | Lokalizacja |
| --- | --- |
| Checkout | `D:\my\Projects\DatasetFactory` |
| Srodowisko Python | `<checkout>\.venv` |
| Zaleznosci frontendowe | `<checkout>\frontend\node_modules` |
| Workspace | `DF_WORKSPACE_DIR`, domyslnie `D:\DatasetFactory\workspace` |
| Baza SQLite | `DF_WORKSPACE_DIR\project.db` |
| Log aplikacji | `DF_WORKSPACE_DIR\logs\app.jsonl` |
| Cache uv/npm/Playwright/E2E | `DF_CACHE_DIR`, domyslnie `D:\DatasetFactory\cache` |
| Przegladarki Playwright | `DF_CACHE_DIR\ms-playwright` |
| FFmpeg/ffprobe | `DF_FFMPEG_PATH` / `DF_FFPROBE_PATH` |
| Tesseract/model | `DF_TESSERACT_PATH` / `DF_TESSERACT_MODEL_PATH` |

## Czyszczenie stanu

Najpierw zatrzymaj `dev.ps1`. Usuniecie workspace kasuje baze, klatki, eksporty
i logi bez mozliwosci odzyskania; przed operacja wykonaj kopie potrzebnych danych.
Usuwaj tylko dokladna sciezke z `DF_WORKSPACE_DIR`, nigdy szeroki katalog `D:\`.

Cache mozna usunac niezaleznie po zatrzymaniu aplikacji. Kolejny bootstrap lub
E2E odtworzy potrzebne katalogi; ponowne pobranie zaleznosci moze potrwac.
Nie usuwaj recznie pojedynczych plikow z aktywnego workspace, bo baza i artefakty
sa jednym stanem projektu.

## Brak FFmpeg lub ffprobe

`bootstrap.ps1` nie instaluje kodekow. Rozpakuj portable FFmpeg, na przyklad do
`D:\tools\ffmpeg`, i ustaw pelne sciezki do `ffmpeg.exe` oraz `ffprobe.exe` w
`.env`. Ponow bootstrap. Istniejaca, uruchamialna kopia zostanie tylko wykryta.

## Brak Tesseracta lub modelu

Tesseract jest eksperymentalnym adapterem dev-only. Umiesc zweryfikowany runtime
na `D:`, na przyklad w `D:\tools\tesseract-5.5.3`, i ustaw w `.env`:

- `DF_TESSERACT_PATH`;
- `DF_TESSERACT_MODEL_PATH`;
- `DF_TESSERACT_RUNTIME_SHA256` dla `tesseract.exe`;
- `DF_TESSERACT_MODEL_SHA256` dla `eng.traineddata`.

Bootstrap zatrzyma sie przed instalacja zaleznosci, jesli pliku brakuje albo hash
jest inny. Nie obchodz weryfikacji przez wpisanie hasha nieznanego artefaktu.
Obecny runtime nie moze wejsc do pakietu produkcyjnego.

## Typowe problemy

- **Brak `.env`:** `Copy-Item .env.example .env`, ustaw sciezki i ponow komende.
- **Port 8000/5173 zajety:** zakoncz poprzedni `dev.ps1`; sprawdz proces przez
  `Get-NetTCPConnection -LocalPort 8000,5173`.
- **Brak przegladarki Playwright:** ponow `scripts/bootstrap.ps1`; przegladarka
  trafia do `DF_CACHE_DIR\ms-playwright`, nie do profilu na `C:`.
- **Czerwona bramka:** napraw pierwsza pozycje `FAIL` z podsumowania i ponow caly
  `scripts/check.ps1`; nie uruchamiaj dalszych bramek wybiorczo jako dowodu.
