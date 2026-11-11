# 04: Odporne sterowanie rozmową

**What to build:** Czytelne stany oczekiwania, blokadę podwójnego wysłania, Stop z zachowaniem częściowej odpowiedzi, obsługę błędu providera oraz Retry bez dublowania wiadomości. Zmiana workspace’u i wylogowanie anulują aktywne żądanie, czyszczą stan i ignorują spóźnione chunki.

**Blocked by:** 03 — Autoryzowany czat ze strumieniowaniem i instrukcjami workspace’u.

**Status:** ready-for-agent

- [ ] Podczas odpowiedzi widoczny jest stan oczekiwania (także przed pierwszym fragmentem tekstu) i nie można wysłać duplikatu wiadomości. Stany ładowania i błędu są ogłaszane dostępnie, ale nie każdy token osobno. Kontrolki Stop i Retry są opisane, gdy mają zastosowanie.
- [ ] Stop kończy generowanie, zachowuje częściowy tekst, oznacza odpowiedź jako zatrzymaną i przywraca interaktywne sterowanie.
- [ ] Błąd providera daje użyteczny komunikat oraz Retry bez ponownego dodania wiadomości użytkownika. Nie ma automatycznych, niekończących się ponowień.
- [ ] Zmiana workspace’u lub wylogowanie anuluje aktywne żądanie, usuwa wiadomości, częściowy tekst i błędy, i nie pozwala starym chunkom pojawić się w nowym workspace’ie.
- [ ] Stan rozmowy żyje tylko w pamięci przeglądarki. Przeładowanie strony czyści rozmowę.
