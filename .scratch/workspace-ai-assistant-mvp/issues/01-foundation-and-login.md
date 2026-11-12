# 01: Fundament aplikacji i logowanie

**What to build:** Uruchamialną aplikację z konfiguracją środowiska, bazą i migracjami, Better Auth, stroną logowania oraz powtarzalnymi danymi demonstracyjnymi dla dwóch użytkowników i ich odrębnych workspace’ów. Po zalogowaniu użytkownik widzi wyłącznie listę własnych workspace’ów.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Aplikacja uruchamia się z udokumentowaną lokalną konfiguracją, bez sekretów ani haseł w repozytorium. Dane demonstracyjne pochodzą wyłącznie z lokalnej konfiguracji środowiska.
- [ ] Stack jest zgodny z `docs/spec.md` i `AGENTS.md`: Next.js App Router, TypeScript w trybie strict, Tailwind CSS i shadcn/ui, Zod, Better Auth, PostgreSQL i Drizzle z committowanymi migracjami, Vitest i React Testing Library. Nie dodawaj TanStack Query ani globalnego store.
- [ ] Są udokumentowane i działające skrypty `typecheck`, `lint` oraz testów jednostkowych i integracyjnych. Kolejne bilety z nich korzystają.
- [ ] Warstwa bazy odpowiada za zapytania o workspace’y i członkostwa i jest oddzielona od UI oraz autoryzacji.
- [ ] Seed tworzy dwóch użytkowników, dwa odrębne workspace’y, ich członkostwa oraz różne `assistantInstructions` dla każdego workspace’u (User A tylko w Workspace A, User B tylko w Workspace B).
- [ ] Prawidłowe dane demonstracyjne prowadzą do listy workspace’ów dostępnych tylko dla zalogowanego użytkownika.
