# Audit Report (Initial)

This document will be updated as we perform the refactor.

Planned refactors:
- Centralize configuration (done: config/index.ts)
- Introduce logger (done: lib/logger.ts)
- Replace hardcoded PROVIDER_URL occurrences with config.providerUrl
- Consolidate token routes
- Improve error handling and request validation
- Add linting and formatting configs

Next steps: replace providerUrl in services, ensure build.