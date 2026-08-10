[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('nonprod', 'production')]
  [string]$Environment,

  [string]$EvidenceDirectory = 'artifacts/production-readiness/phase-5a'
)

$ErrorActionPreference = 'Stop'
$Locked = @{
  nonprod = @{
    project = 'moazez-nonprod-91001421934'
    private = 'moazez-nonprod-91001421934-private'
    published = 'moazez-nonprod-91001421934-published'
    origins = @(
      'https://staging-schools.moazez.cloud',
      'https://staging-admin.moazez.cloud'
    )
  }
  production = @{
    project = 'moazez-production'
    private = 'moazez-production-91001421934-private'
    published = 'moazez-production-91001421934-published'
    origins = @(
      'https://schools.moazez.cloud',
      'https://admin.moazez.cloud'
    )
  }
}
$Selected = $Locked[$Environment]
$RuntimeEmails = @(
  "moazez-api-runtime@$($Selected.project).iam.gserviceaccount.com",
  "moazez-core-worker@$($Selected.project).iam.gserviceaccount.com",
  "moazez-media-worker@$($Selected.project).iam.gserviceaccount.com"
)
$SignerEmail = "moazez-gcs-signer@$($Selected.project).iam.gserviceaccount.com"
$IacDeployerEmail = "moazez-iac-deployer@$($Selected.project).iam.gserviceaccount.com"
$ExpectedServiceAccounts = @($RuntimeEmails) + @($SignerEmail, $IacDeployerEmail)

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Write-Error 'GCLOUD_CLI=UNAVAILABLE'
  exit 2
}

function Invoke-GcloudCapture {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    & gcloud @Arguments 1> $stdoutPath 2> $stderrPath
    return [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Stdout = [System.IO.File]::ReadAllText($stdoutPath)
      Stderr = [System.IO.File]::ReadAllText($stderrPath)
    }
  }
  finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-GcloudJson {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $result = Invoke-GcloudCapture $Arguments
  if ($result.ExitCode -ne 0) { throw 'gcloud_read_failed' }
  if ([string]::IsNullOrWhiteSpace($result.Stdout)) { return @() }
  return $result.Stdout | ConvertFrom-Json
}

function Get-NestedValue {
  param(
    [Parameter(Mandatory)]$Object,
    [Parameter(Mandatory)][string[]]$CandidatePaths
  )

  foreach ($candidatePath in $CandidatePaths) {
    $current = $Object
    $found = $true
    foreach ($part in $candidatePath.Split('.')) {
      $property = $current.PSObject.Properties[$part]
      if ($null -eq $property) {
        $found = $false
        break
      }
      $current = $property.Value
    }
    if ($found) { return $current }
  }
  return $null
}

function Assert-Exact {
  param($Actual, $Expected, [string]$Code)
  if ($Actual -ne $Expected) { throw $Code }
}

function Assert-SetEqual {
  param([object[]]$Actual, [object[]]$Expected, [string]$Code)
  $actualValues = @($Actual | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  $expectedValues = @($Expected | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  if (Compare-Object $actualValues $expectedValues) { throw $Code }
}

function Get-BindingMembers {
  param($Policy, [string]$Role)
  return @(
    $Policy.bindings |
      Where-Object { $_.role -eq $Role } |
      ForEach-Object { $_.members } |
      ForEach-Object { [string]$_ }
  )
}

function Assert-ManagedBindingContract {
  param(
    $Policy,
    [hashtable]$Allowed,
    [string[]]$ManagedMembers,
    [string]$Code
  )

  foreach ($binding in $Policy.bindings) {
    $managedInBinding = @($binding.members) | Where-Object {
      $ManagedMembers -contains $_
    }
    if ($managedInBinding.Count -eq 0) { continue }
    if (-not $Allowed.ContainsKey([string]$binding.role)) { throw $Code }
    $allowedMembers = @($Allowed[[string]$binding.role])
    foreach ($member in $managedInBinding) {
      if ($allowedMembers -notcontains $member) { throw $Code }
    }
  }
}

function Get-BucketEvidence {
  param([string]$BucketName, [string[]]$ExpectedOrigins)

  $description = Invoke-GcloudJson @(
    'storage', 'buckets', 'describe', "gs://$BucketName", '--format=json'
  )
  $location = [string](Get-NestedValue $description @('location'))
  $storageClass = [string](Get-NestedValue $description @(
    'storageClass', 'storage_class', 'defaultStorageClass', 'default_storage_class'
  ))
  $ubla = Get-NestedValue $description @(
    'uniformBucketLevelAccess',
    'uniform_bucket_level_access',
    'iamConfiguration.uniformBucketLevelAccess.enabled'
  )
  if ($null -ne $ubla -and $ubla.PSObject.Properties['enabled']) {
    $ubla = $ubla.enabled
  }
  $pap = [string](Get-NestedValue $description @(
    'publicAccessPrevention',
    'public_access_prevention',
    'iamConfiguration.publicAccessPrevention'
  ))
  $versioning = Get-NestedValue $description @(
    'versioning.enabled', 'versioningEnabled', 'versioning_enabled'
  )
  $softDelete = Get-NestedValue $description @(
    'softDeletePolicy.retentionDurationSeconds',
    'soft_delete_policy.retention_duration_seconds',
    'softDeletePolicy.retentionDuration',
    'soft_delete_policy.retention_duration'
  )
  $softDeleteSeconds = [int64](([string]$softDelete) -replace 's$', '')
  $cors = @(Get-NestedValue $description @('cors', 'corsConfig', 'cors_config'))
  if ($cors.Count -ne 1) { throw 'bucket_cors_rule_count_invalid' }
  $corsRule = $cors[0]
  $origins = @(Get-NestedValue $corsRule @('origin', 'origins'))
  $methods = @(Get-NestedValue $corsRule @('method', 'methods'))
  $headers = @(Get-NestedValue $corsRule @(
    'responseHeader', 'responseHeaders', 'response_header', 'response_headers'
  ))
  $maxAge = Get-NestedValue $corsRule @(
    'maxAgeSeconds', 'max_age_seconds', 'maxAgeSec'
  )
  $lifecycleRules = @(Get-NestedValue $description @(
    'lifecycle.rule', 'lifecycleRule', 'lifecycle_rule', 'lifecycleConfig.rule'
  ))
  $retentionPolicy = Get-NestedValue $description @(
    'retentionPolicy', 'retention_policy'
  )

  Assert-Exact $location 'ME-CENTRAL2' 'bucket_location_invalid'
  Assert-Exact $storageClass 'STANDARD' 'bucket_storage_class_invalid'
  Assert-Exact ([bool]$ubla) $true 'bucket_ubla_invalid'
  Assert-Exact $pap 'enforced' 'bucket_pap_invalid'
  Assert-Exact ([bool]$versioning) $true 'bucket_versioning_invalid'
  Assert-Exact $softDeleteSeconds 604800 'bucket_soft_delete_invalid'
  Assert-SetEqual $origins $ExpectedOrigins 'bucket_cors_origins_invalid'
  Assert-SetEqual $methods @('GET', 'HEAD', 'PUT') 'bucket_cors_methods_invalid'
  Assert-SetEqual $headers @(
    'Content-Type',
    'Content-Disposition',
    'Range',
    'Content-Range',
    'ETag',
    'x-goog-generation'
  ) 'bucket_cors_headers_invalid'
  Assert-Exact ([int]$maxAge) 3600 'bucket_cors_max_age_invalid'
  Assert-Exact $lifecycleRules.Count 0 'bucket_lifecycle_rules_present'
  if ($null -ne $retentionPolicy) { throw 'bucket_retention_policy_present' }

  return [ordered]@{
    name = $BucketName
    location = $location
    storageClass = $storageClass
    uniformBucketLevelAccess = [bool]$ubla
    publicAccessPrevention = $pap
    versioningEnabled = [bool]$versioning
    softDeleteSeconds = $softDeleteSeconds
    cors = [ordered]@{
      origins = $origins
      methods = $methods
      responseHeaders = $headers
      maxAgeSeconds = [int]$maxAge
    }
    automaticLifecycleRules = 0
    retentionPolicyConfigured = $false
  }
}

function Assert-IamContract {
  $privatePolicy = Invoke-GcloudJson @(
    'storage', 'buckets', 'get-iam-policy', "gs://$($Selected.private)", '--format=json'
  )
  $publishedPolicy = Invoke-GcloudJson @(
    'storage', 'buckets', 'get-iam-policy', "gs://$($Selected.published)", '--format=json'
  )
  $projectPolicy = Invoke-GcloudJson @(
    'projects', 'get-iam-policy', $Selected.project, '--format=json'
  )
  $signerPolicy = Invoke-GcloudJson @(
    'iam', 'service-accounts', 'get-iam-policy', $SignerEmail,
    "--project=$($Selected.project)", '--format=json'
  )

  foreach ($policy in @($privatePolicy, $publishedPolicy, $projectPolicy, $signerPolicy)) {
    $members = @($policy.bindings | ForEach-Object { $_.members })
    if ($members -contains 'allUsers' -or $members -contains 'allAuthenticatedUsers') {
      throw 'anonymous_iam_member_present'
    }
  }

  $runtimeMembers = @($RuntimeEmails | ForEach-Object { "serviceAccount:$_" })
  Assert-SetEqual (
    Get-BindingMembers $privatePolicy 'roles/storage.objectUser'
  ) $runtimeMembers 'private_runtime_object_user_invalid'
  Assert-SetEqual (
    Get-BindingMembers $privatePolicy 'roles/storage.objectViewer'
  ) @("serviceAccount:$SignerEmail") 'private_signer_viewer_invalid'
  Assert-SetEqual (
    Get-BindingMembers $privatePolicy 'roles/storage.objectCreator'
  ) @("serviceAccount:$SignerEmail") 'private_signer_creator_invalid'
  Assert-SetEqual (
    Get-BindingMembers $publishedPolicy 'roles/storage.objectViewer'
  ) @("serviceAccount:$SignerEmail") 'published_signer_viewer_invalid'
  if ((Get-BindingMembers $publishedPolicy 'roles/storage.objectUser').Count -ne 0) {
    throw 'published_runtime_object_user_present'
  }

  $readinessRole = "projects/$($Selected.project)/roles/moazezStorageBucketMetadataReader"
  Assert-SetEqual (
    Get-BindingMembers $projectPolicy $readinessRole
  ) $runtimeMembers 'runtime_readiness_role_invalid'
  Assert-SetEqual (
    Get-BindingMembers $signerPolicy 'roles/iam.serviceAccountTokenCreator'
  ) @("serviceAccount:$($RuntimeEmails[0])") 'api_signer_binding_invalid'

  $signerMember = "serviceAccount:$SignerEmail"
  $iacDeployerMember = "serviceAccount:$IacDeployerEmail"
  $managedMembers = @($runtimeMembers) + @($signerMember, $iacDeployerMember)
  Assert-ManagedBindingContract $privatePolicy @{
    'roles/storage.objectUser' = $runtimeMembers
    'roles/storage.objectViewer' = @($signerMember)
    'roles/storage.objectCreator' = @($signerMember)
  } $managedMembers 'private_managed_identity_scope_invalid'
  Assert-ManagedBindingContract $publishedPolicy @{
    'roles/storage.objectViewer' = @($signerMember)
  } $managedMembers 'published_managed_identity_scope_invalid'
  Assert-ManagedBindingContract $projectPolicy @{
    $readinessRole = $runtimeMembers
  } $managedMembers 'project_managed_identity_scope_invalid'
  Assert-ManagedBindingContract $signerPolicy @{
    'roles/iam.serviceAccountTokenCreator' = @("serviceAccount:$($RuntimeEmails[0])")
  } $managedMembers 'signer_managed_identity_scope_invalid'

  $prohibitedRoles = @(
    'roles/owner',
    'roles/editor',
    'roles/resourcemanager.projectIamAdmin',
    'roles/storage.admin',
    'roles/storage.objectAdmin',
    'roles/iam.serviceAccountAdmin'
  )
  foreach ($binding in $projectPolicy.bindings) {
    if ($prohibitedRoles -contains $binding.role) {
      $prohibitedMembers = @($binding.members) | Where-Object {
        $runtimeMembers -contains $_ -or $_ -eq "serviceAccount:$SignerEmail" -or
          $_ -eq "serviceAccount:$IacDeployerEmail"
      }
      if ($prohibitedMembers.Count -gt 0) { throw 'broad_project_role_present' }
    }
  }

  return [ordered]@{
    anonymousMembersAbsent = $true
    privateRuntimeObjectUserMembers = $runtimeMembers
    privateSignerRoles = @('roles/storage.objectViewer', 'roles/storage.objectCreator')
    publishedSignerRoles = @('roles/storage.objectViewer')
    readinessRole = $readinessRole
    apiOnlySignerTokenCreator = $true
    broadRuntimeSignerDeployerRolesAbsent = $true
  }
}

function Get-ProductionObjectCounts {
  param([string]$BucketName)

  $live = @(Invoke-GcloudJson @(
    'storage', 'ls', "gs://$BucketName/**", '--json'
  )).Count
  $allVersions = @(Invoke-GcloudJson @(
    'storage', 'ls', '--all-versions', "gs://$BucketName/**", '--json'
  )).Count
  $softDeleted = @(Invoke-GcloudJson @(
    'storage', 'ls', '--soft-deleted', '--exhaustive',
    "gs://$BucketName/**", '--json'
  )).Count
  $noncurrent = $allVersions - $live
  if ($noncurrent -lt 0) { throw 'noncurrent_object_count_invalid' }
  if ($live -ne 0 -or $noncurrent -ne 0 -or $softDeleted -ne 0) {
    throw 'production_bucket_not_clean_start'
  }
  return [ordered]@{
    bucket = $BucketName
    LIVE_OBJECTS = $live
    NONCURRENT_OBJECTS = $noncurrent
    SOFT_DELETED_OBJECTS = $softDeleted
  }
}

function Get-RegionalEndpointDiagnostic {
  $previous = $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE
  try {
    $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE =
      'https://storage.me-central2.rep.googleapis.com/'
    $result = Invoke-GcloudCapture @(
      'storage', 'buckets', 'describe', "gs://$($Selected.private)",
      '--format=value(location)'
    )
    if ($result.ExitCode -eq 0 -and $result.Stdout.Trim() -eq 'ME-CENTRAL2') {
      return [ordered]@{ status = 'PASS'; endpoint = 'storage.me-central2.rep.googleapis.com' }
    }
    return [ordered]@{ status = 'NON_BLOCKING_FAILURE'; endpoint = 'storage.me-central2.rep.googleapis.com' }
  }
  finally {
    if ($null -eq $previous) {
      Remove-Item Env:CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE -ErrorAction SilentlyContinue
    }
    else {
      $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE = $previous
    }
  }
}

$serviceAccounts = @(
  Invoke-GcloudJson @(
    'iam', 'service-accounts', 'list', "--project=$($Selected.project)",
    '--format=json(email)'
  ) | ForEach-Object { [string]$_.email }
)
Assert-SetEqual (
  $serviceAccounts | Where-Object { $ExpectedServiceAccounts -contains $_ }
) $ExpectedServiceAccounts 'storage_service_accounts_missing'

$evidence = [ordered]@{
  schemaVersion = 1
  proof = 'PRD5A-G03_READ_ONLY_CONFIGURATION'
  status = 'PASS'
  timestamp = [DateTimeOffset]::UtcNow.ToString('o')
  environment = $Environment
  project = $Selected.project
  productionObjectWritesProhibited = $true
  buckets = @(
    Get-BucketEvidence $Selected.private $Selected.origins
    Get-BucketEvidence $Selected.published $Selected.origins
  )
  serviceAccounts = $ExpectedServiceAccounts
  iam = Assert-IamContract
  regionalEndpointDiagnostic = Get-RegionalEndpointDiagnostic
}

if ($Environment -eq 'production') {
  $evidence.productionZeroObjectEvidence = @(
    Get-ProductionObjectCounts $Selected.private
    Get-ProductionObjectCounts $Selected.published
  )
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$artifactRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $repositoryRoot 'artifacts\production-readiness\phase-5a')
)
$outputDirectory = [System.IO.Path]::GetFullPath(
  (Join-Path $repositoryRoot $EvidenceDirectory)
)
$artifactPrefix = $artifactRoot + [System.IO.Path]::DirectorySeparatorChar
if (
  -not $outputDirectory.Equals($artifactRoot, [StringComparison]::OrdinalIgnoreCase) -and
  -not $outputDirectory.StartsWith($artifactPrefix, [StringComparison]::OrdinalIgnoreCase)
) {
  throw 'proof_evidence_directory_invalid'
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$outputPath = Join-Path $outputDirectory "gcs-batch2-readonly-$Environment-$runId.json"
New-Item -ItemType File -Path $outputPath -ErrorAction Stop | Out-Null
$evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outputPath -Encoding utf8NoBOM
[ordered]@{ status = 'PASS'; evidencePath = $outputPath } | ConvertTo-Json
