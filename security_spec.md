# Polin Manga Firestore Security Specification (Phase 0)

## 1. Data Invariants & Relationship Mapping
- **Master Source of Truth**: `/users/{userId}` is the root owner document for each authenticated Firebase user (`userId == request.auth.uid`).
- **PII Isolation**: Email addresses are stored exclusively inside `/users/{userId}/private/info` and readable/writable only by the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`).
- **Master Gate**: Every bookmark (`/users/{userId}/bookmarks/{bookmarkId}`) and reading history entry (`/users/{userId}/history/{historyId}`) requires the parent `/users/{userId}` document to exist (`exists(/databases/$(database)/documents/users/$(userId))`) on single-document reads and writes.
- **Immutability**: `uid`, `userId`, `mangaId`, and `createdAt` can never change after document creation.
- **Temporal Integrity**: `createdAt` must equal `request.time` on create; `updatedAt` must equal `request.time` on both create and update.
- **Strict Boundaries**: Every string enforces explicit `.size()` bounds matching `firebase-blueprint.json`; IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars); `pageIndex` is an integer in `[0, 10000]`; shadow fields are rejected via `hasAll`/`hasOnly` on create and `affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: Read `/users/u1/bookmarks/md-1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Create `/users/u1` with `auth.uid == 'u1'` and `email_verified == false` -> `PERMISSION_DENIED`.
3. **Cross-User PII Access**: User `u2` reads `/users/u1/private/info` -> `PERMISSION_DENIED`.
4. **Cross-User Bookmark List**: User `u2` lists `/users/u1/bookmarks` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: User `u1` creates `/users/u1/bookmarks/md-1` with `{ userId: 'u2', ... }` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection (Create)**: User `u1` creates `/users/u1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
7. **Shadow Field Injection (Update)**: User `u1` updates `/users/u1/bookmarks/md-1` adding `role: 'admin'` -> `PERMISSION_DENIED`.
8. **Immutable Field Tampering**: User `u1` updates `/users/u1/history/md-1` changing `createdAt` or `mangaId` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: User `u1` creates `/users/u1/bookmarks/md-1` with `createdAt` set to a past timestamp (`!= request.time`) -> `PERMISSION_DENIED`.
10. **ID Poisoning**: User `u1` writes `/users/u1/bookmarks/bad$id!with/junk` or 200-char ID -> `PERMISSION_DENIED`.
11. **Value Poisoning (Oversized String / Bad Type)**: User `u1` updates `/users/u1/history/md-1` with `pageIndex: -5` or `mangaTitle` > 240 chars -> `PERMISSION_DENIED`.
12. **Orphaned Subcollection Write**: User `u1` creates `/users/u1/bookmarks/md-1` before parent `/users/u1` exists -> `PERMISSION_DENIED`.
