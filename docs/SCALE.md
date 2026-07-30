# SCALE — świadome granice MVP

| Obecne ograniczenie | Trigger | Docelowy kierunek |
|---------------------|---------|-------------------|
| Jeden aktywny run, worker in-process | potrzeba 2+ równoległych runów lub restart backendu nie może pauzować pracy | osobny trwały worker i kolejka z lease |
| Do 2 h / 50 GB / 7200 klatek | realny materiał przekracza limit albo UI zwalnia | chunking runu, wirtualizacja/indeksy i budżet dysku per chunk |
| SQLite, jeden projekt | kilka projektów jednocześnie lub wielu użytkowników | jawny tenant/project scope i PostgreSQL |
| Polling co 2 s | polling obciąża API albo potrzebne logi live | SSE dla statusów; WebSocket tylko przy komunikacji dwukierunkowej |
| Tesseract experimental za `OcrEngine` | przed packaged v1 lub gdy odrzuty blokują realny dataset | reprezentatywny benchmark i zatwierdzony char-level adapter/model fontu gry |
| Regiony pikselowe jednej rozdzielczości | pierwszy materiał o innej rozdzielczości/aspect ratio | regiony znormalizowane + reguła dopasowania profilu |
| Brak ręcznego dodania boksu | odrzucenia z powodu brakującego znaku są istotne | edytor geometrii i F09 |
| COCO bez train/val | pierwszy powtarzalny trening z aplikacji | deterministyczny split z seedem i manifestem |
| API bez auth na loopback | bind sieciowy, użytkownik zewnętrzny lub zdalny worker | auth, role/project ownership, TLS |
| Brak automatycznego backupu/CI | dataset odtwarzany >1 dzień / pierwszy współpracownik | snapshoty i workflow CI |
| Desktop ≥1280 | realna potrzeba pracy na mniejszym urządzeniu | responsywny inspector/canvas albo desktop shell |
| SAM 3 tylko status „poza v1” | rozpoczęcie F10 | osobny adapter modelu/checkpointów, maski i tracking z provenance |
