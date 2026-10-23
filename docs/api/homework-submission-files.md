# Homework submission files (ST-01)

All routes use the existing `/api/v1` prefix, JWT authentication and the active
school membership. No permission changes or migrations are required.

## Teacher Dashboard

Use the existing submission attachment list:

`GET /api/v1/teacher/homeworks/classes/{classId}/assignments/{homeworkId}/submissions/{submissionId}/attachments`

`classId` is the teacher subject **allocation ID**, as in the other Teacher
Homework routes. For each returned `attachmentId`, the following routes stream
the student's submitted file:

| Method | Suffix after the submission path | Behavior |
| --- | --- | --- |
| GET / HEAD | `/attachments/{attachmentId}/preview` | Inline content for the existing trusted MIME allowlist |
| GET / HEAD | `/attachments/{attachmentId}/download` | Attachment download |

Both require `homework.submissions.view`. They verify the current teacher
allocation, owned homework, live student enrollment, matching target and
submitted/late/reviewed submission, exact submission attachment, and active
private File belonging to the student. The complete chain is checked again
before response headers. A missing or mismatched resource returns 404. Actor
and permission guards retain their existing 401/403 behavior.

For example, fetch the preview with the same bearer token and active school
context used for the submission list. Render only a successful response:

```http
GET /api/v1/teacher/homeworks/classes/{allocationId}/assignments/{homeworkId}/submissions/{submissionId}/attachments/{attachmentId}/preview
Authorization: Bearer <access-token>
Range: bytes=0-1023
```

Full GET returns 200; a satisfiable byte range returns 206 with `Content-Range`;
invalid, multiple or unsatisfiable ranges return 416. HEAD returns the full
representation headers and no body. A mismatched `If-Range` returns full content.
Responses use `Cache-Control: no-store, private, max-age=0`, `nosniff`, safe
`Content-Disposition` filenames and abort-aware streaming. Untrusted inline MIME
returns 403; use download instead. No signed URL or storage coordinates are
returned. The teacher does not need `files.downloads.view`.

These are **student submission** attachments. Homework assignment attachments
have their own list and IDs; an assignment attachment ID cannot be used here.

## Student App

Keep the existing upload and linking flow. Upload a private File through the
current Files API, then link its returned ID:

```http
POST /api/v1/student/homeworks/{homeworkId}/submission/attachments
Authorization: Bearer <access-token>
Content-Type: application/json

{"fileId":"<uploaded-file-id>"}
```

For homework with zero active questions, a correctly linked active private file
can be the entire submission. Submit through either existing alias:

```http
POST /api/v1/student/homeworks/{homeworkId}/submit
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

`POST /api/v1/student/homeworks/{homeworkId}/submission/submit` remains equivalent.
An omitted, null or blank `bodyText` is accepted when there is an eligible file.
The existing response has `submission.status` of `submitted` or `late` and
`submission.bodyText: null` for a file-only response. Existing draft body text
remains the fallback when omitted. Text-only submissions remain supported.
All current homework modes already support submission attachments; no new mode
or response policy is introduced.

An empty submission returns the existing `validation.failed` 400. Deleted,
public, foreign, unlinked or inconsistently linked files do not satisfy the
file-only requirement. Required question answers remain mandatory (422 on
omission). Current assignment, target, enrollment, submission, answer and file
state is checked inside the final transaction; duplicate submit and terminal
edits retain 409 behavior. Submission, answer and attachment writes serialize
on the target, including the first submission. File records are held stable
through commit. Storage network I/O stays outside database transactions.

The existing student **assignment attachment** download redirect (307) and
`/attachments/{attachmentId}/download/content` byte stream remain compatible.
Existing upload size limits, generic IAM permissions and Grade Sync behavior
are unchanged.
