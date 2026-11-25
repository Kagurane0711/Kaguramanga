/**
 * Payload-First Security Specification Test Cases for Polin Manga Firestore Rules.
 * Covers all 12 Dirty Dozen adversarial payloads defined in security_spec.md.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated bookmark read is denied',
    operation: 'get',
    path: '/users/userA/bookmarks/md-abc123',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email profile create is denied',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email_verified: false },
    payload: { uid: 'userA', displayName: 'Reader', photoUrl: '' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-user PII read on private/info is denied',
    operation: 'get',
    path: '/users/userA/private/info',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-user bookmark list query is denied',
    operation: 'list',
    path: '/users/userA/bookmarks',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Identity spoofing userId on bookmark create is denied',
    operation: 'create',
    path: '/users/userA/bookmarks/md-abc123',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      userId: 'userB',
      mangaId: 'md-abc123',
      title: 'Test Manga',
      image: '',
      latestChapter: 'Ch 1',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow field injection on profile create is denied',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      displayName: 'Reader',
      photoUrl: '',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Shadow field injection on bookmark update is denied',
    operation: 'update',
    path: '/users/userA/bookmarks/md-abc123',
    auth: { uid: 'userA', email_verified: true },
    payload: { title: 'Updated', role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable mangaId tampering on history update is denied',
    operation: 'update',
    path: '/users/userA/history/md-abc123',
    auth: { uid: 'userA', email_verified: true },
    payload: { mangaId: 'md-tampered' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client-forged createdAt timestamp is denied',
    operation: 'create',
    path: '/users/userA/bookmarks/md-abc123',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      userId: 'userA',
      mangaId: 'md-abc123',
      title: 'Test',
      image: '',
      latestChapter: '',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Oversized / invalid characters in bookmark document ID is denied',
    operation: 'create',
    path: '/users/userA/bookmarks/bad$id!invalid',
    auth: { uid: 'userA', email_verified: true },
    payload: { userId: 'userA', mangaId: 'bad$id!invalid', title: 'X', image: '', latestChapter: '' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value poisoning negative pageIndex or >240 char title is denied',
    operation: 'update',
    path: '/users/userA/history/md-abc123',
    auth: { uid: 'userA', email_verified: true },
    payload: { pageIndex: -5, mangaTitle: 'A'.repeat(300) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned bookmark write without existing parent user doc is denied',
    operation: 'create',
    path: '/users/ghostUser/bookmarks/md-abc123',
    auth: { uid: 'ghostUser', email_verified: true },
    payload: { userId: 'ghostUser', mangaId: 'md-abc123', title: 'Test', image: '', latestChapter: '' },
    expected: 'PERMISSION_DENIED',
  },
];
