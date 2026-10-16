# ADR 0001: Retire the GraphQL endpoint and keep REST as the single API contract

- **Status:** Accepted
- **Date:** 2026-10-16
- **Issue:** #45 (backlog item 1.12)
- **Remediation log:** SURFACE-01

## Context

The first version of the API (October 2026) shipped two delivery mechanisms over the same user domain: REST routes (`/users`, `/users/{id}`, `/api/v1/users`) and a GraphQL endpoint served by Apollo Server (`/graphql` with the `users` and `user` queries and the `createUser` mutation). Both called the same `UserService`, so the business rules were not duplicated. GraphQL was there to evaluate a flexible query interface next to REST.

The security review of October 2026 showed three things:

- **No client uses GraphQL.** The Next.js frontend calls only the REST routes, and the README never documented the GraphQL endpoint. An endpoint without a consumer gets less attention than the rest of the API (OWASP API9:2023, Improper Inventory Management).
- **Every edge rule had to exist twice.** Authentication, input validation, pagination, caching and error formatting were implemented once in the Express middleware chain and again in the Apollo context and resolvers. Two findings came from that drift: the GraphQL `createUser` mutation skipped the Zod validation (VAL-01) and could store a password shaped like a bcrypt hash without hashing it (PWD-01, issue #41). The two paths also behaved differently: the mutation wrote straight to PostgreSQL instead of going through the RabbitMQ registration queue, and a missing token answered `500` instead of `401` (issue #38).
- **GraphQL needs controls of its own.** Aliases let one HTTP request run many operations (each `createUser` runs bcrypt with cost 12), which the per-request rate limits do not count; query depth and complexity need limits; introspection and the Apollo Sandbox need to stay off in production. The backlog had already dropped depth and complexity limits as over-engineering, pending this decision.

## Decision

Retire the GraphQL endpoint. REST, described by `openapi.yaml`, is the single API contract.

- `src/app.ts` no longer creates or mounts Apollo Server; `src/graphql/schema.graphql`, `src/graphql/userResolvers.ts` and their tests are removed, together with the `@apollo/server`, `@as-integrations/express5` and `graphql` dependencies.
- The legacy WebSocket blueprint, which only lived in the `src/graphql/` folder, moves to `src/realtime/socket-deprecated.ts`; only its comments change.
- Without the Apollo Sandbox, Helmet's Content Security Policy is enforced in every environment, not only in production.
- Two tests keep the contract honest: every Express route must be documented in `openapi.yaml` (inventory), and every operation documented as protected must answer `401` without a token (parity).

## Consequences

- One place to secure. The remaining P1 fixes (shared JWT verification in #38, ownership and admin rules in #36, a response DTO in #48) are implemented once, in the REST path.
- A smaller supply chain: three fewer runtime dependencies and one fewer Dependabot exception.
- The application core does not depend on the delivery mechanism: controllers translate HTTP, `UserService` holds the rules and `UserRepository` sits behind `IUserRepository`. If a client ever needs flexible queries (for example, a dashboard that combines several resources in one call), a GraphQL adapter can be added back on top of the same services. It would then reuse the shared token verification and the service-level authorization, and add depth, complexity and alias limits before it goes live.
- The removed code stays in the git history (last version before this decision: `64f26da`).
