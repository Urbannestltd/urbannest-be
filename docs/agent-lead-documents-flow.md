# Agent Lead — Document Upload Flow

For frontend implementation of document upload/staging on agent leads.

## 1. Uploading files to storage (applies to every file, both flows below)

1. For each file the agent selects, call `POST /storage/sign-url` to get a presigned upload URL.
2. Upload the raw file bytes directly to that URL (bypasses our API).
3. Keep the resulting `{ url, fileName }` for each file, plus the `category`/`type` the user picked for it — needed in step 2 of whichever flow below.

**Allowed file extensions:** `.pdf`, `.jpg`, `.jpeg`, `.png`
**Max file size:** 10MB

**Valid `category` → `type` pairs:**

| category | valid types |
|---|---|
| `ID` | `PASSPORT`, `NATIONAL_ID`, `DRIVERS_LICENSE`, `VOTERS_CARD` |
| `PROOF_OF_INCOME` | `BANK_STATEMENT`, `EMPLOYMENT_LETTER`, `PAYSLIP`, `PROOF_OF_BUSINESS` |
| `PROOF_OF_ADDRESS` | `UTILITY_BILL`, `BANK_STATEMENT` |

---

## 2. Flow A — lead already exists (the common case)

1. `POST /agent/leads` → create the draft lead → get `leadId` back.
2. Collect `{ url, fileName, category, type }` for every document the agent uploaded for this lead.
3. **One call, all documents at once:**

   ```
   POST /agent/leads/{leadId}/documents
   { "documents": [ { url, fileName, category, type }, ... ] }
   ```

   - Response: `201`, `data` = array of created documents (`{ id, category, type, url, fileName, fileSizeBytes, createdAt }`).
   - **All-or-nothing**: every document in the array is validated (extension + size, via a server-side HEAD request to its URL) before anything is saved. If any one fails, the whole call fails with `400` and **nothing** is created — not even the valid ones. Retry with a corrected array, or drop the bad file and resubmit.
   - Only works while the lead is still in draft (`PENDING`) status — `409` otherwise.
4. Add referees: `POST /agent/leads/{leadId}/referees` (one call per referee — `{ name, phone, email?, relationship? }`).
5. `PATCH /agent/leads/{leadId}/forward` — requires at least one document attached; sends the lead to the landlord.

**Deleting a document from this lead** (only while still draft):

```
DELETE /agent/leads/{leadId}/documents/{documentId}
```

---

## 3. Flow B — documents uploaded before the lead exists (staging)

Use this when the UI lets the agent upload documents before/independently of filling in the lead form (e.g. a general "my uploads" area, or reusing a prospect's ID across multiple applications).

1. Upload files to storage as in section 1.
2. **One call, no `leadId` involved:**

   ```
   POST /agent/lead-documents
   { "documents": [ { url, fileName, category, type }, ... ] }
   ```

   - Same all-or-nothing validation behavior as Flow A.
   - Response: `201`, `data` = array of created documents, each with `leadId: null`.
3. Store the returned `id`s in your form state.
4. Optionally, `GET /agent/lead-documents` any time to list all of this agent's currently-unattached documents (e.g. to render a "3 unattached files" drawer).
5. Once the lead is created (`POST /agent/leads` → `leadId`):

   ```
   PATCH /agent/leads/{leadId}/documents/attach
   { "documentIds": ["id1", "id2", "id3"] }
   ```

   - Attaches the staged documents to the lead. Response: `data` = array of the now-attached documents.
   - **All-or-nothing** here too: if any `documentId` doesn't exist, isn't owned by this agent, or is already attached elsewhere, the whole call `404`s.
   - Only works while the lead is still `PENDING` — `409` otherwise.
6. Continue with referees + forward as in Flow A steps 4–5.

**Deleting a staged (not-yet-attached) document:**

```
DELETE /agent/lead-documents/{documentId}
```

- `409` if you accidentally call this on a document that's already attached to a lead — the error message tells you to use the lead-scoped delete instead (Flow A) rather than this one.

---

## 4. Quick reference — which delete endpoint to use

| Document state | Delete endpoint |
|---|---|
| Attached to a lead | `DELETE /agent/leads/{leadId}/documents/{documentId}` |
| Staged / unattached (`leadId` is `null` in the response you got when listing/creating it) | `DELETE /agent/lead-documents/{documentId}` |

That `leadId` field (present on staged-document responses, `null` when unattached) is the one thing to check client-side before deciding which delete call to make.
