[CmdletBinding()]
param(
  [string]$ClassifyErrorText,
  [string]$ClassifyCustomRoleErrorText,
  [string]$CaptureFixtureCommandPath,
  [string[]]$CaptureFixtureArguments = @()
)

$ErrorActionPreference = 'Stop'
$ProductionProject = 'moazez-production'
$NonprodProject = 'moazez-nonprod-91001421934'
$BootstrapRequiredApi = 'serviceusage.googleapis.com'
$TerraformManagedApis = @(
  'storage.googleapis.com',
  'iam.googleapis.com',
  'iamcredentials.googleapis.com',
  'cloudresourcemanager.googleapis.com'
)
$ReportedApis = @($BootstrapRequiredApi) + @($TerraformManagedApis)
$RelevantServiceAccountIds = @(
  'moazez-api-runtime',
  'moazez-core-worker',
  'moazez-media-worker',
  'moazez-gcs-signer',
  'moazez-iac-deployer'
)
$ApprovedTargets = @{
  'moazez-production' = @{
    buckets = @(
      'moazez-production-91001421934-private',
      'moazez-production-91001421934-published'
    )
  }
  'moazez-nonprod-91001421934' = @{
    buckets = @(
      'moazez-nonprod-91001421934-private',
      'moazez-nonprod-91001421934-published'
    )
  }
}
$script:GcloudCommandPath = $null

function Resolve-GcloudCommandPath {
  param([string]$FixturePath)

  if (-not [string]::IsNullOrWhiteSpace($FixturePath)) {
    if (-not (Test-Path -LiteralPath $FixturePath -PathType Leaf)) {
      throw 'GCLOUD_CAPTURE_FIXTURE_NOT_FOUND'
    }
    return (Resolve-Path -LiteralPath $FixturePath).Path
  }
  $command = Get-Command gcloud.cmd -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -eq $command -or [string]::IsNullOrWhiteSpace($command.Source)) {
    return $null
  }
  return $command.Source
}

function Invoke-GcloudCapture {
  param([Parameter(Mandatory)][string[]]$Arguments)

  if ([string]::IsNullOrWhiteSpace($script:GcloudCommandPath)) {
    throw 'GCLOUD_COMMAND_PATH_UNAVAILABLE'
  }
  $processArguments = @($Arguments | ForEach-Object {
    if ($null -eq $_ -or $_ -match '[\x00\r\n"%!]') {
      throw 'GCLOUD_ARGUMENT_UNSAFE_FOR_WINDOWS_COMMAND_SHIM'
    }
    '"' + $_ + '"'
  }) -join ' '
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process `
      -FilePath $script:GcloudCommandPath `
      -ArgumentList $processArguments `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -NoNewWindow `
      -Wait `
      -PassThru
    return [pscustomobject]@{
      ExitCode = [int]$process.ExitCode
      Stdout = [System.IO.File]::ReadAllText($stdoutPath)
      Stderr = [System.IO.File]::ReadAllText($stderrPath)
    }
  }
  finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Test-AuthenticationFailure {
  param([string]$Text)

  return $Text -match '(?is)reauthentication\s+failed|invalid_grant|not\s+logged\s+in|cannot\s+refresh\s+(?:the\s+)?auth(?:entication)?\s+tokens?|failed\s+to\s+refresh\s+(?:the\s+)?auth(?:entication)?\s+tokens?'
}

function Get-FailureClassification {
  param([AllowEmptyString()][Parameter(Mandatory)][string]$Text)

  if (Test-AuthenticationFailure $Text) {
    return 'AUTHENTICATION_FAILED'
  }
  if (
    $Text -match '(?is)(permission|forbidden).*(?:\bor\b.*)?(?:may|might|could).*(?:not\s+exist|not\s+be\s+found)' -or
    $Text -match '(?is)(permission|forbidden).*\bor\b.*(?:not\s+exist|not\s+be\s+found)' -or
    $Text -match '(?is)(?:not\s+exist|not\s+be\s+found).*(?:or|and).*(?:permission|forbidden)'
  ) {
    return 'UNRESOLVED'
  }
  if ($Text -match 'PERMISSION_DENIED|does not have permission|permission denied|forbidden') {
    return 'ACCESS_DENIED'
  }
  if ($Text -match 'NOT_FOUND|was not found|could not be found|does not exist') {
    return 'NOT_FOUND'
  }
  return 'UNRESOLVED'
}

function Get-CustomRoleStateFromCapture {
  param([Parameter(Mandatory)]$CaptureResult)

  if ($CaptureResult.ExitCode -eq 0) { return 'EXISTS' }
  $classification = Get-FailureClassification $CaptureResult.Stderr
  if ($classification -eq 'NOT_FOUND') { return 'ABSENT' }
  if ($classification -eq 'AUTHENTICATION_FAILED') {
    return 'AUTHENTICATION_FAILED'
  }
  return 'UNRESOLVED'
}

if ($PSBoundParameters.ContainsKey('ClassifyErrorText')) {
  Write-Output (Get-FailureClassification $ClassifyErrorText)
  exit 0
}

if ($PSBoundParameters.ContainsKey('ClassifyCustomRoleErrorText')) {
  Write-Output (Get-CustomRoleStateFromCapture ([pscustomobject]@{
    ExitCode = 1
    Stdout = ''
    Stderr = $ClassifyCustomRoleErrorText
  }))
  exit 0
}

$script:GcloudCommandPath = Resolve-GcloudCommandPath $CaptureFixtureCommandPath
if ([string]::IsNullOrWhiteSpace($script:GcloudCommandPath)) {
  Write-Error 'GCLOUD_CLI=UNAVAILABLE'
  exit 2
}

if ($PSBoundParameters.ContainsKey('CaptureFixtureCommandPath')) {
  Invoke-GcloudCapture $CaptureFixtureArguments | ConvertTo-Json -Compress
  exit 0
}

function ConvertFrom-SafeJson {
  param([Parameter(Mandatory)][string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  return $Value | ConvertFrom-Json
}

function New-ApiReport {
  param([string[]]$EnabledApis, [bool]$QuerySucceeded)

  return @($ReportedApis | ForEach-Object {
    [ordered]@{
      name = $_
      management = if ($_ -eq $BootstrapRequiredApi) {
        'BOOTSTRAP_REQUIRED'
      } else {
        'TERRAFORM_MANAGED'
      }
      enabled = if ($QuerySucceeded) { $EnabledApis -contains $_ } else { $null }
    }
  })
}

function New-UnresolvedTargetReport {
  param([Parameter(Mandatory)][string]$ProjectId)

  $targets = $ApprovedTargets[$ProjectId]
  return [ordered]@{
    buckets = @($targets.buckets | ForEach-Object {
      [ordered]@{ name = $_; state = 'NOT_CHECKED_PROJECT_UNRESOLVED' }
    })
    serviceAccounts = @($RelevantServiceAccountIds | ForEach-Object {
      [ordered]@{
        email = "$_@${ProjectId}.iam.gserviceaccount.com"
        state = 'NOT_CHECKED_PROJECT_UNRESOLVED'
      }
    })
    customRole = [ordered]@{
      name = "projects/$ProjectId/roles/moazezStorageBucketMetadataReader"
      state = 'NOT_CHECKED_PROJECT_UNRESOLVED'
    }
  }
}

function Get-ProjectReport {
  param([Parameter(Mandatory)][string]$ProjectId)

  $describe = Invoke-GcloudCapture @(
    'projects', 'describe', $ProjectId, '--format=json'
  )
  if ($describe.ExitCode -ne 0) {
    $visibility = Get-FailureClassification $describe.Stderr
    return [ordered]@{
      projectId = $ProjectId
      visibility = $visibility
      authenticationStatus = if ($visibility -eq 'AUTHENTICATION_FAILED') {
        'FAILED'
      } else {
        'NOT_DETECTED'
      }
      lifecycleState = $null
      billingEnabled = $null
      projectNumber = $null
      apiQueryStatus = 'NOT_CHECKED_PROJECT_UNRESOLVED'
      requiredApis = New-ApiReport @() $false
      buckets = @()
      relevantServiceAccounts = @()
      targetResources = New-UnresolvedTargetReport $ProjectId
      EXISTING_TARGET_RESOURCES = 'UNRESOLVED'
    }
  }

  $project = ConvertFrom-SafeJson $describe.Stdout
  $billingResult = Invoke-GcloudCapture @(
    'billing', 'projects', 'describe', $ProjectId, '--format=json'
  )
  $billing = if ($billingResult.ExitCode -eq 0) {
    ConvertFrom-SafeJson $billingResult.Stdout
  } else { $null }

  $apiResult = Invoke-GcloudCapture @(
    'services', 'list', '--enabled', "--project=$ProjectId", '--format=json(config.name)'
  )
  $apiQuerySucceeded = $apiResult.ExitCode -eq 0
  $enabledApis = if ($apiQuerySucceeded) {
    @((ConvertFrom-SafeJson $apiResult.Stdout) | ForEach-Object { $_.config.name })
  } else { @() }

  $bucketResult = Invoke-GcloudCapture @(
    'storage', 'buckets', 'list', "--project=$ProjectId", '--format=json(name,location,storageClass)'
  )
  $bucketQuerySucceeded = $bucketResult.ExitCode -eq 0
  $buckets = if ($bucketQuerySucceeded) {
    @(ConvertFrom-SafeJson $bucketResult.Stdout)
  } else { @() }
  $bucketNames = @($buckets | ForEach-Object {
    ([string]$_.name) -replace '^gs://', ''
  })

  $serviceAccountResult = Invoke-GcloudCapture @(
    'iam', 'service-accounts', 'list', "--project=$ProjectId", '--format=json(email,name)'
  )
  $serviceAccountQuerySucceeded = $serviceAccountResult.ExitCode -eq 0
  $serviceAccounts = if ($serviceAccountQuerySucceeded) {
    @(ConvertFrom-SafeJson $serviceAccountResult.Stdout) |
      Where-Object {
        $accountId = [string]$_.email -replace '@.*$', ''
        $RelevantServiceAccountIds -contains $accountId
      }
  } else { @() }
  $serviceAccountEmails = @($serviceAccounts | ForEach-Object { [string]$_.email })

  $targets = $ApprovedTargets[$ProjectId]
  $targetBuckets = @($targets.buckets | ForEach-Object {
    [ordered]@{
      name = $_
      state = if (-not $bucketQuerySucceeded) {
        'UNRESOLVED'
      } elseif ($bucketNames -contains $_) {
        'EXISTS'
      } else {
        'ABSENT'
      }
    }
  })
  $targetServiceAccounts = @($RelevantServiceAccountIds | ForEach-Object {
    $email = "$_@${ProjectId}.iam.gserviceaccount.com"
    [ordered]@{
      email = $email
      state = if (-not $serviceAccountQuerySucceeded) {
        'UNRESOLVED'
      } elseif ($serviceAccountEmails -contains $email) {
        'EXISTS'
      } else {
        'ABSENT'
      }
    }
  })

  $customRoleName = "projects/$ProjectId/roles/moazezStorageBucketMetadataReader"
  $customRoleResult = $null
  $customRoleState = if (-not $apiQuerySucceeded) {
    'UNRESOLVED'
  } elseif (-not ($enabledApis -contains 'iam.googleapis.com')) {
    'NOT_CHECKED_API_DISABLED'
  } else {
    $customRoleResult = Invoke-GcloudCapture @(
      'iam', 'roles', 'describe', 'moazezStorageBucketMetadataReader',
      "--project=$ProjectId", '--format=json(name,stage)'
    )
    Get-CustomRoleStateFromCapture $customRoleResult
  }

  $collisionStates = @($targetBuckets.state) + @($targetServiceAccounts.state) + @($customRoleState)
  $existingTargetResources = if ($collisionStates -contains 'EXISTS') {
    'REVIEW_REQUIRED'
  } elseif (
    $collisionStates -contains 'UNRESOLVED' -or
    $collisionStates -contains 'AUTHENTICATION_FAILED'
  ) {
    'UNRESOLVED'
  } else {
    'NONE'
  }
  $authenticationFailed = @(
    Test-AuthenticationFailure $billingResult.Stderr
    Test-AuthenticationFailure $apiResult.Stderr
    Test-AuthenticationFailure $bucketResult.Stderr
    Test-AuthenticationFailure $serviceAccountResult.Stderr
    if ($null -ne $customRoleResult) {
      Test-AuthenticationFailure $customRoleResult.Stderr
    }
  ) -contains $true

  return [ordered]@{
    projectId = $ProjectId
    visibility = 'VISIBLE'
    authenticationStatus = if ($authenticationFailed) { 'FAILED' } else { 'PASS' }
    lifecycleState = $project.lifecycleState
    billingEnabled = if ($null -ne $billing) { [bool]$billing.billingEnabled } else { $null }
    projectNumber = [string]$project.projectNumber
    apiQueryStatus = if ($apiQuerySucceeded) { 'RESOLVED' } else { 'UNRESOLVED' }
    requiredApis = New-ApiReport $enabledApis $apiQuerySucceeded
    buckets = $buckets
    relevantServiceAccounts = $serviceAccounts
    targetResources = [ordered]@{
      buckets = $targetBuckets
      serviceAccounts = $targetServiceAccounts
      customRole = [ordered]@{ name = $customRoleName; state = $customRoleState }
    }
    EXISTING_TARGET_RESOURCES = $existingTargetResources
  }
}

$accountResult = Invoke-GcloudCapture @(
  'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'
)
$activeAccount = if ($accountResult.ExitCode -eq 0) {
  $accountResult.Stdout.Trim()
} else { '' }
$accountAuthenticationStatus = if ($accountResult.ExitCode -eq 0) {
  'PASS'
} elseif (Test-AuthenticationFailure $accountResult.Stderr) {
  'FAILED'
} else {
  'UNRESOLVED'
}

$production = Get-ProjectReport $ProductionProject
$nonprod = Get-ProjectReport $NonprodProject
$nonprodAccess = switch ($nonprod.visibility) {
  'VISIBLE' { 'RESOLVED_VISIBLE' }
  'ACCESS_DENIED' { 'ACCESS_DENIED' }
  'NOT_FOUND' { 'NOT_FOUND' }
  default { 'UNRESOLVED' }
}
$nonprodServiceUsage = @($nonprod.requiredApis | Where-Object {
  $_.name -eq $BootstrapRequiredApi
})[0]
$authenticationStatus = if (
  $accountAuthenticationStatus -eq 'FAILED' -or
  $production.authenticationStatus -eq 'FAILED' -or
  $nonprod.authenticationStatus -eq 'FAILED'
) {
  'FAILED'
} elseif ($accountAuthenticationStatus -eq 'UNRESOLVED') {
  'UNRESOLVED'
} else {
  'PASS'
}
$ready = (
  -not [string]::IsNullOrWhiteSpace($activeAccount) -and
  $authenticationStatus -eq 'PASS' -and
  $nonprod.visibility -eq 'VISIBLE' -and
  $nonprod.lifecycleState -eq 'ACTIVE' -and
  $nonprod.billingEnabled -eq $true -and
  -not [string]::IsNullOrWhiteSpace($nonprod.projectNumber) -and
  $nonprodServiceUsage.enabled -eq $true -and
  $nonprod.EXISTING_TARGET_RESOURCES -eq 'NONE'
)

$report = [ordered]@{
  schemaVersion = 1
  checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
  activeGcloudAccount = $activeAccount
  AUTHENTICATION_STATUS = $authenticationStatus
  production = $production
  nonprod = $nonprod
  BOOTSTRAP_REQUIRED_API = [ordered]@{
    name = $BootstrapRequiredApi
    enabled = $nonprodServiceUsage.enabled
  }
  SERVICE_USAGE_API_ENABLED = if ($nonprodServiceUsage.enabled -eq $true) {
    'YES'
  } elseif ($nonprodServiceUsage.enabled -eq $false) {
    'NO'
  } else {
    'UNRESOLVED'
  }
  TERRAFORM_MANAGED_APIS = $TerraformManagedApis
  NONPROD_PROJECT_ACCESS = $nonprodAccess
  EXISTING_TARGET_RESOURCES = $nonprod.EXISTING_TARGET_RESOURCES
  READY_FOR_NONPROD_TERRAFORM_PLAN = if ($ready) { 'YES' } else { 'NO' }
}

$report | ConvertTo-Json -Depth 8
if (-not $ready) { exit 3 }
