# DatasetFactory - runbook lokalny

## Codzienny start i zatrzymanie

Z katalogu checkoutu:

```powershell
.\scripts\dev.ps1
```

Backend dziala pod `http://127.0.0.1:8000`, frontend pod
`http://127.0.0.1:5173`. Zakoncz przez `Ctrl+C`; skrypt sprzata oba drzewa
procesow, wlacznie z procesami potomnymi uvicorn/Vite.

Tryb spakowany (FastAPI i zbudowana SPA pod jednym adresem, bez serwera Vite):

```powershell
.\scripts\package-local.ps1
```

Aplikacja dziala wtedy pod `http://127.0.0.1:8000`. `frontend/dist` jest
artefaktem ignorowanym przez Git i nie zawiera runtime ani modelu OCR.

Pelna lokalna bramka:

```powershell
.\scripts\check.ps1
```

Kolejnosc jest stala: `ruff format --check`, `ruff check`, `python -m mypy`,
`pytest`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`,
`npm run test:e2e-root`. Pierwsza czerwona bramka zatrzymuje przebieg, a
podsumowanie wskazuje blad i liczbe pominietych bramek. Pelny backendowy
`pytest` trwa okolo 5 minut na zweryfikowanej maszynie deweloperskiej.

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
| RapidOCR/modele | `DF_RAPIDOCR_MODEL_DIR` |
| Wybor silnika OCR | `DF_OCR_ENGINE` |

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

Tesseract jest eksperymentalnym adapterem dostarczanym wylacznie przez operatora;
repozytorium i packaged-local nie zawieraja binarki ani modelu. Aby wlaczyc
realny OCR, umiesc zweryfikowany runtime na `D:`, na przyklad w
`D:\tools\tesseract-5.5.3`, i ustaw w `.env`:

- `DF_TESSERACT_PATH`;
- `DF_TESSERACT_MODEL_PATH`;
- `DF_TESSERACT_RUNTIME_SHA256` dla `tesseract.exe`;
- `DF_TESSERACT_MODEL_SHA256` dla `eng.traineddata`.

Gdy obu plikow nie ma, bootstrap kontynuuje z ostrzezeniem, a status systemu i
Dashboard pokazuja stan zdegradowany z TD-015; utworzenie realnego runu OCR daje
kontrolowany blad konfiguracji, nie traceback ani sztuczny wynik. Gdy pliki sa,
bootstrap i aplikacja wymagaja zgodnych sum. Mismatch jest bledem i nie wolno go
obchodzic przez wpisanie hasha nieznanego artefaktu.

## Silnik OCR: Tesseract albo RapidOCR

Silnik OCR wybiera sie przy kazdym runie w Run Setup (pole "OCR engine"); lista
pokazuje tylko silniki, ktorych instalacja przeszla weryfikacje, a pozostale
wymienia z powodem. `DF_OCR_ENGINE` w `.env` (`tesseract`, domyslnie, albo
`rapidocr`) ustawia tylko silnik domyslny, zmiana wymaga restartu backendu. Run
wznawia sie zawsze na silniku, na ktorym go utworzono. Dwa runy nie pracuja
naraz: drugi start daje `409 active_run`.

RapidOCR to siec neuronowa, ktora sama znajduje tekst na wycinku, wiec nie
potrzebuje ustawienia "Text layout" (ekran profilu go wtedy nie pokazuje).
Biblioteki `rapidocr` i `onnxruntime` sa zaleznosciami projektu (`uv sync`),
ale modele ONNX dostarcza operator i nigdy nie sa pobierane przy starcie:

- `DF_RAPIDOCR_MODEL_DIR` - katalog na `D:` z dwoma plikami,
  `PP-OCRv6_det_small.onnx` i `PP-OCRv6_rec_small.onnx` (domyslnie
  `D:\tools\rapidocr-3.10.0\models`);
- `DF_RAPIDOCR_VERSION` - `rapidocr` i `onnxruntime` tak, jak zglaszaja je
  zainstalowane pakiety (`3.10.0+onnxruntime-1.32.0`);
- `DF_RAPIDOCR_RUNTIME_SHA256` - SHA-256 biblioteki natywnej
  `onnxruntime_pybind11_state` z `.venv`;
- `DF_RAPIDOCR_MODELS_SHA256` - SHA-256 tekstu `<nazwa pliku>:<SHA-256 pliku>`
  dla obu modeli, posortowanych po nazwie, po jednym w wierszu.

Aplikacja mierzy te pliki przy tworzeniu runu i odmawia, gdy cokolwiek nie
zgadza sie z przypietymi wartosciami (status systemu pokazuje wtedy stan
zdegradowany, run daje kontrolowany blad). Brak modeli zachowuje sie jak brak
Tesseracta opisany wyzej. Bramka jakosci RapidOCR nie byla mierzona (TD-027),
wiec kazdy wynik nadal wymaga recznej weryfikacji.

## Autorytatywne sciezki FFmpeg

`DF_FFMPEG_PATH` i `DF_FFPROBE_PATH` z `.env` sa jedynym zrodlem prawdy dla
bootstrapu, aplikacji i realnego E2E. Sam wpis w systemowym `PATH` nie wystarcza;
popraw `.env`, jesli narzedzia sa zainstalowane w innym miejscu.

## Typowe problemy

- **Brak `.env`:** `Copy-Item .env.example .env`, ustaw sciezki i ponow komende.
- **Port 8000/5173 zajety:** zakoncz poprzedni `dev.ps1`; sprawdz proces przez
  `Get-NetTCPConnection -LocalPort 8000,5173`.
- **Brak przegladarki Playwright:** ponow `scripts/bootstrap.ps1`; przegladarka
  trafia do `DF_CACHE_DIR\ms-playwright`, nie do profilu na `C:`.
- **Czerwona bramka:** napraw pierwsza pozycje `FAIL` z podsumowania i ponow caly
  `scripts/check.ps1`; nie uruchamiaj dalszych bramek wybiorczo jako dowodu.
