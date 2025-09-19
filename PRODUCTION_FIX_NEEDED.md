# Production Fix Required for Admin Upload Feature

## Issue Summary
The admin file upload feature fails with a CORS error and storage permission denied error due to:
1. Cloud Function `makeUserAdmin` missing CORS headers
2. Storage rules expecting `ownerUid` field that may not exist in older project documents

## Root Cause
- The `makeUserAdmin` function sets Firebase Auth custom claims but doesn't create the required Firestore user document
- Storage rules check for admin role in Firestore `users` collection, not Auth custom claims
- Storage rules also try to read `ownerUid` from project documents for read permissions

## Required Fixes

### 1. Deploy Updated Cloud Function (CRITICAL)
The `functions/index.js` file has been updated to:
- Add CORS headers: `onCall({ cors: true }, ...)`
- Create Firestore user document with admin role
- Set both Auth custom claims AND Firestore document

**Deploy command:**
```bash
firebase deploy --only functions
```

### 2. Deploy Updated Storage Rules (CRITICAL)
The current storage rules in `storage.rules` have been simplified to remove the problematic `ownerUid` check:

```javascript
// ✅ Entregables: solo admin puede escribir
match /deliverables/{docId}/{fileName=**} {
  allow write: if isAdmin();
  // lectura: solo admin por ahora
  allow read: if isAdmin();
}
```

**Deploy command:**
```bash
firebase deploy --only storage
```

## Files Created
- `firestore.indexes.json` - Firestore indexes configuration
- `firestore.rules` - Basic Firestore security rules

## Files Modified
- `functions/index.js` - Added CORS headers and Firestore document creation to makeUserAdmin function
- `storage.rules` - Changed admin check from Auth custom claims to Firestore document, simplified read permissions
- `functions/make_admin.html` - Added emulator connection imports (commented out for production)
- `submit-request.html` - Added emulator connection imports (commented out for production)
- `dashboard.html` - Added emulator connection imports (commented out for production)
- `index.html` - Added emulator connection imports (commented out for production)
- `firebase.json` - Added emulator configuration for local development

## Key Changes Summary
1. **CORS Fix**: Added `{ cors: true }` to makeUserAdmin function
2. **Admin Role Check**: Changed from Auth custom claims to Firestore document lookup
3. **Firestore Document Creation**: makeUserAdmin now creates user document with admin role
4. **Emulator Support**: Added emulator configuration (disabled in production)
5. **Storage Rules**: Simplified deliverables read permissions to admin-only

## Testing
After deployment, the admin upload should work without CORS or permission errors.

