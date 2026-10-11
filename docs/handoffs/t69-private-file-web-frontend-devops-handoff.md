# T6.9 private-file web frontend and DevOps handoff

Backend direct-content transport is implemented and locally verified. Frontend adoption and live browser/GCS/Cloud Run acceptance remain required before release. The [source audit](../maintenance/t69-system-wide-private-file-web-access-audit.md) contains every transport route, additional metadata consumer, permission, resolver, tenancy boundary and verification limit. Source main is `e5b580bbceef56d1bd4589557d65c2d147fd93b3`; use the delivery Draft PR's exact head and canonical CI receipt for candidate identity.

Delivery: [Draft PR #207](https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend/pull/207). The final receipt in its description records the immutable candidate SHA, canonical CI run and verified artifact ID/digest. Deployments and acceptance evidence must identify that same candidate.

Avatar, reward catalog/history and Teacher proof content routes exclude Student credential secret artifacts, as generic Files already does. A linked image/proof/avatar ID cannot override that export boundary; treat its 404 as unavailable content and retain the privileged credential-export flow.

The incident proves failing Student/Teacher browser flows through 307, with working mobile applications. Backend OPTIONS 204 and GCS OPTIONS 200, without the final GCS GET, do **not** prove GCS CORS as the root cause. Preserve a redacted browser trace of the original flow and the replacement flow. Record root cause unproven independently from compatibility fix implemented and live acceptance pending.

## Frontend route adoption

All paths below use authenticated backend requests with the current session's Authorization header and normal trusted school context. Do not place JWTs in query strings. Do not send authorization to a signed storage host. The content response is binary, not a JSON URL/envelope. Old 307 paths, TTLs and mobile/native contracts remain available.

| Context                          | GET direct-content path                                                                                                                        | Presentation / adoption                                                                                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student Academic Content         | `/api/v1/student/academic-content/:contentId/assets/:fileId/access/content?mode=download` or `mode=preview`                                    | Same returned fileId and publication visibility/policy.                                                                                                                                                                                                                            |
| Parent child Academic Content    | `/api/v1/parent/children/:studentId/academic-content/:contentId/assets/:fileId/access/content?mode=download` or `mode=preview`                 | Use selected owned child, not arbitrary school File.                                                                                                                                                                                                                               |
| Teacher current Academic Content | `/api/v1/teacher/academic-content/:contentId/assets/:assetId/access/content?mode=download` or `mode=preview`                                   | Current assetId differs from fileId.                                                                                                                                                                                                                                               |
| Teacher historical revision      | `/api/v1/teacher/academic-content/:contentId/revisions/:revisionId/assets/:fileId/access/content?mode=download` or `mode=preview`              | Exact selected immutable revision and fileId; current allocation still required.                                                                                                                                                                                                   |
| Student messages, existing       | `/api/v1/student/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download/content` and `/preview/content` | Attachment / safe inline. Prefer additive authorized content-path fields.                                                                                                                                                                                                          |
| Teacher messages                 | `/api/v1/teacher/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download/content` and `/preview/content` | Same conversation/member/message boundary. Prefer additive fields.                                                                                                                                                                                                                 |
| Parent messages                  | `/api/v1/parent/messages/conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download/content` and `/preview/content`  | Same participant boundary; camelCase and existing Parent snake_case contracts are additive.                                                                                                                                                                                        |
| Student homework, existing       | `/api/v1/student/homeworks/:homeworkId/attachments/:attachmentId/download/content`                                                             | Existing authorized content path; now actual partial ranges.                                                                                                                                                                                                                       |
| Parent child task proof          | `/api/v1/parent/children/:studentId/files/:fileId/download/content`                                                                            | Append `/content` to the existing Parent proof download path. This is proof-only, not a generic child-file grant.                                                                                                                                                                  |
| Teacher review proof             | `/api/v1/teacher/tasks/review-queue/:submissionId/files/:fileId/download/content`                                                              | Replace generic proof downloadPath using returned submission ID and file ID; requires reinforcement.reviews.view.                                                                                                                                                                  |
| Teacher task-detail proof        | `/api/v1/teacher/tasks/:taskId/submissions/:submissionId/files/:fileId/download/content`                                                       | Replace generic task proof path using exact task/submission/file IDs; requires reinforcement.tasks.view.                                                                                                                                                                           |
| Applicant document               | `/api/v1/applicant-portal/requests/:requestId/documents/:documentId/download/content`                                                          | Own authenticated Applicant request/document; no school membership required.                                                                                                                                                                                                       |
| School management Files          | `/api/v1/files/:id/download/content`                                                                                                           | Existing School-only file authority. Attendance excuses, Student documents, School homework/question/answer/assessment attachments and other authorized School file consumers can append `/content` to their existing generic download path. Actor adapters cannot use this route. |
| Student own avatar               | `/api/v1/student/profile/avatar/:fileId/content`                                                                                               | Safe inline; replace profile generic avatar URL using own returned avatar file ID. Header auth is required, so fetch small image into a temporary object URL rather than placing this endpoint directly in img.src.                                                                |
| Student visible catalog image    | `/api/v1/student/rewards/:rewardId/images/:fileId/download/content`                                                                            | Replace generic image path using catalog/image IDs.                                                                                                                                                                                                                                |
| Parent visible catalog image     | `/api/v1/parent/children/:studentId/rewards/:rewardId/images/:fileId/download/content`                                                         | Use selected owned child and catalog/image IDs.                                                                                                                                                                                                                                    |
| Student redemption-history image | `/api/v1/student/rewards/redemptions/:redemptionId/images/:fileId/download/content`                                                            | Use redemption ID; catalog route may correctly be unavailable for draft/archived catalog.                                                                                                                                                                                          |
| Parent redemption-history image  | `/api/v1/parent/children/:studentId/rewards/redemptions/:redemptionId/images/:fileId/download/content`                                         | Own child's historical redemption ID and image ID.                                                                                                                                                                                                                                 |

Catalog/proof/profile legacy metadata fields remain compatible. Replace them deliberately for web using the appropriate context above; blindly appending `/content` to an actor's old generic `/files/` URL still returns 403. Teacher/Parent announcement and homework/exam metadata currently contain no authorized actor file-download URL; bare file IDs do not confer file authority. Do not invent a generic fallback. Public branding stays on its existing public logo URL. Null Teacher/Parent/contact/hero image fields require no file request. Credential secret exports remain their explicit privileged CSV contract and are excluded from generic content downloads.

## HTTP response contract

200 contains full exact bytes; 206 contains one exact range with `Content-Range: bytes start-end/total`; 416 is bodyless with `Content-Range: bytes */total` and Content-Length 0. Responses have the persisted safe MIME, exact Content-Length, Accept-Ranges bytes, safe Content-Disposition with ASCII filename and UTF-8 filename\*, no-store/private/max-age=0 and nosniff. Download is attachment. Preview is inline only for allowed safe MIME and current domain/School policy; Office/archive/CSV/HTML/SVG/JavaScript/unknown preview is refused. Browser codec/rendering support remains separate from MIME eligibility.

Range supports `bytes=0-1048575`, `bytes=1048576-`, and `bytes=-65536`, with clamped end/suffix. Multipart, malformed, unsafe integer, reversed or unsatisfiable ranges produce 416; no multipart response is implemented. HEAD runs the same authorization, policy and stat, returns full 200 metadata without object bytes, and ignores Range. Express supplies HEAD for the registered GET paths; no permission-free HEAD handler exists. If-Range accepts the exact opaque strong ETag returned by this backend. Weak/date/mismatched validators fall back to full 200; Last-Modified, date validation and general 304 revalidation are not promised.

The exact approved CORS origin sets are unchanged:

- Production: `https://schools.moazez.cloud`, `https://admin.moazez.cloud`, `https://student.moazez.cloud`, `https://teacher.moazez.cloud`.
- Staging: `https://staging-schools.moazez.cloud`, `https://staging-admin.moazez.cloud`.

Only Content-Disposition, Content-Range, Accept-Ranges and ETag exposure is added. Content-Length is safelisted. Credentials and strict origin checks remain. Parent web acceptance must use an approved origin; this change does not authorize a new Parent origin. Verify Range/If-Range preflight on the actual deployed route and origin.

The shared content response helper exposes these headers on successful, HEAD and 416 content responses. The global CORS policy remains unchanged; error envelopes and unrelated API routes retain their existing CORS response contract.

401 means authenticate/refresh using the existing session flow; retry only after successful authentication. 403 means actor/permission/policy denial; do not retry through generic Files or signed fallback to evade it. 404 includes invisible/deleted/unlinked/foreign/stale or unavailable files and must not reveal provider coordinates. 416 means re-read current authorized metadata and validate offsets. Pre-header provider failures/init timeouts are sanitized 503. A failed/truncated body after headers rejects/aborts the transfer; do not mark it successful merely because status was 200/206. Do not parse binary success bodies as JSON. Bounded redacted error envelopes can be read before delivery; never log tokens or signed URLs.

For a **small, UI-bounded** download, fetch may collect a Blob and save an object URL. An application-selected 50 MiB example limit here is a frontend memory policy, not a backend upload/download cap. Check authorized HEAD Content-Length before choosing this path and account for concurrent downloads. Revoke object URLs after the browser has consumed them; cancel on navigation/component disposal.

```ts
async function fetchSmallFile(
  url: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<Blob> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metadata = await fetch(url, {
    method: 'HEAD',
    headers,
    signal,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!metadata.ok) throw new Error(`File metadata HTTP ${metadata.status}`);
  const size = Number(metadata.headers.get('Content-Length'));
  if (!Number.isSafeInteger(size) || size < 0 || size > 50 * 1024 ** 2)
    throw new Error('Use the supported streaming-download flow');
  const response = await fetch(url, {
    headers,
    signal,
    cache: 'no-store',
    redirect: 'error',
  });
  if (response.status !== 200) throw new Error(`File HTTP ${response.status}`);
  const blob = await response.blob();
  if (blob.size !== size) throw new Error('Incomplete or changed file');
  return blob;
}
```

Axios small-file equivalent uses `responseType: 'blob'`, the existing Authorization header and cancellation `signal`; inspect status/headers and apply the same frontend bound. An axios Blob of a 512 MiB/10 GiB file is not a viable universal large-file strategy. Do not set a binary responseType globally for JSON API routes.

## Large files and previews

Academic admission still defaults to 512 MiB and hard-caps at 10 GiB. Backend transport does not allocate the whole object or silently lower that limit. Use a feature-detected writable filesystem sink where available (for example File System Access with explicit save gesture). Read response.body chunks with backpressure into that sink. A range-aware resumable client can request bounded pieces, e.g. 16 MiB, and authorize each request; this controls per-request duration/response size and never requires a full-file Blob. Do not claim all browsers support a writable sink.

Recommended sequence:

1. Authenticate HEAD, capture total length, MIME/name, and the opaque strong ETag if available. Choose a destination with explicit user action and initialize/truncate it for a new download.
2. Request one range at a time, with Authorization, Range and exact If-Range ETag. Expect 206 and validate start/end/total, Content-Length and ETag. Stream/read chunks into the destination and count bytes; only record a completed offset after the entire expected range succeeds.
3. On cancellation/network/provider failure, retain only acknowledged complete ranges; seek back to that offset on a controlled retry. Every retry uses the current authorized session. The backend checks current ownership/policy again.
4. A 200 response to a subsequent If-Range request indicates unsupported/mismatched validator and may be the full object. Do not append it. Re-read metadata and restart/truncate deliberately. If no strong ETag exists, do not advertise safe cross-request resume for mutable files.
5. A 416/current total change, changed ETag, 403/404, logout or child/school switch invalidates the pending transfer. Close the writer and report incomplete; never mix revisions. Validate final total length before marking success. ETag is an identity validator, not a client checksum guarantee.

Browsers without a supported writable sink need an approved authenticated service-worker/download bridge or BFF flow designed with the same authorization boundary, or an explicit supported-browser/product limitation for large downloads. That frontend architecture is not introduced by this backend PR. A plain anchor/iframe/video element cannot attach a Bearer header. Avoid token-in-URL workarounds and authorization-forwarding redirect tricks. Small safe preview can fetch a bounded Blob and use an object URL; close/revoke it on disposal. Large PDF/media preview needs a viewer that fetches authenticated ranges, or an approved auth bridge. Do not eagerly Blob-buffer an entire multi-GiB preview. Office/archive downloads open in external apps.

Native curriculum audio/video playback remains its verified-media, bounded signed-capability JSON contract with provider seeking/ranges. Regressions cover its existing actor boundaries and Range-ready contract. Do not replace native playback globally with the proxy or invent browser codec support from a MIME. Academic video/audio content can use authenticated range-aware viewers; media-element integration still needs frontend/live acceptance.

## DevOps release evidence

This task changes no Terraform, IAM policy, Cloud Run configuration, bucket CORS, deploy pipeline or live data. All checks below are pending release-owner evidence, not operations performed by this task.

- Verify the **deployed runtime service account** can stat and read the exact authorized GCS object generation, including ranges. Signing permission alone does not prove runtime byte-read IAM. Confirm bucket/organization boundaries, encryption access where applicable, denied cases and safe error mapping, without exposing credentials or storage coordinates to clients.
- Preserve evidence for the original browser redirect chain: initiator/mode/credentials, request headers at each hop, Location, GCS preflight and final GET/error, relevant response CORS headers and frontend parsing. Redact tokens/capabilities. A missing final GET remains missing evidence, not proof of a GCS failure.
- Record candidate image/revision/commit and actual ingress/proxy behavior. Verify Content-Length plus Node streaming reaches the browser progressively for responses above 32 MiB. Google documents a 32 MiB HTTP/1 response limit when neither chunking nor streaming is used; do not infer deployed ingress acceptance from a local Node pipeline. [Cloud Run quotas](https://docs.cloud.google.com/run/quotas).
- Capture configured request timeout and cancellation behavior. Google documents a default 300 seconds and maximum 3,600 seconds; actual service settings may differ. The backend's 10-second initialization budget is not the full-transfer budget. Test slow clients and bounded ranges/resume across the actual timeout. [Cloud Run request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout).
- Load-test concurrent authorized transfers against the existing service memory/CPU/concurrency, downstream storage throughput and egress budget. Measure process RSS/heap and time to first byte with slow sinks and disconnects; bounded per-stream queues do not prove unlimited concurrency. Verify graceful draining closes provider reads and no background stream survives a disconnect.
- Retain a physical 512 MiB and at least one multi-GiB GCS fixture result, checksum/size/range identity, full and resumed transfer, and rollback observation. The local 10 GiB logical-producer test proves bounded algorithmic buffering, not a physical production transfer or throughput target. Use already-authorized disposable release fixtures; live test-file creation/upload requires the normal release authorization.

## Live acceptance matrix and observability

Use representative authorized and forbidden actors in each approved applicable production/staging origin. Required actor contexts: Student current Academic Content, Teacher current/history, Parent selected child, all three message actors, Student homework, Parent proof, Teacher review/task-detail proof, Applicant document, School generic Files, own Student avatar, Student/Parent visible and historical reward images. Parent and Applicant origins/session handling must be recorded explicitly. Include Chrome/Edge/Firefox/Safari desktop and supported mobile browsers, plus existing native mobile playback/download clients; record version/platform and feature availability rather than asserting all-browser support.

For every applicable context record full 200, prefix/open-ended/suffix 206, malformed/multipart/out-of-bounds 416, HEAD, If-Range match/change, cancellation, stale/deleted/revoked resource, wrong school/child/allocation/conversation/message/file and expired/anonymous/wrong-actor requests. Preview matrix: PDF/TXT, each safe raster format and supported audio/video codec, denied CSV/Office/archive/HTML/SVG/unknown inline; download matrix: the unchanged admitted document/image/audio/video/archive types. Include Unicode/quoted/control filename handling, no-store/nosniff, exposed headers and absence of Location/provider leakage. Verify physical small/default-limit/multi-GiB cases with slow networks and supported memory-safe frontend sinks.

Attach per-case redacted request/response/header/body-size or checksum evidence, origin, actor class, endpoint, candidate revision, status, duration/first byte, bytes received, expected total/range, cancellation outcome and browser result. No tokens, object keys, private buckets or signed capabilities in telemetry. Existing fixed `private_media.content.stream_failed` event intentionally contains no provider cause. Observe API access status/latency, sanitized error code/trace ID, stream failure counts, early disconnects, storage-read failures, RSS, concurrency, egress and Applicant download audit counts. Mid-stream HTTP status alone cannot prove completion; correlate frontend byte completion/error with runtime stream failures. Additional telemetry instrumentation/configuration is release work, not a claimed implementation here.

## Rollback and review boundary

Keep the legacy 307 endpoints and old mobile/native contracts through adoption. Roll back frontend content-route selection per actor/context to its previous compatible client behavior only where actually supported; do not bypass 403/404 or assume the original failing browser flow becomes valid. Backend deployment rollback may return to the reviewed previous revision through the existing release procedure. There is no schema/data migration to reverse. Preserve evidence and existing file ownership; do not delete/relink files or loosen IAM/CORS as a rollback. Coordinate frontend rollout/rollback with whether the backend revision contains these new routes.

Delivery is one **Draft** PR with exact-head canonical checks, test discovery/execution parity and immutable artifact identity/digest. Independent Backend engineering review and all pending live acceptance evidence are required before a separate approved release. This task stops without Ready, merge, production image publication, deployment, infrastructure mutation or live database changes.
