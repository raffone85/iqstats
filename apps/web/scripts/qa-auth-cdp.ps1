param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(320, 2560)]
  [int] $Width,

  [Parameter(Mandatory = $true)]
  [ValidateRange(480, 2160)]
  [int] $Height,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1024, 65535)]
  [int] $Port,

  [Parameter(Mandatory = $true)]
  [string] $ScreenshotPath,

  [ValidateSet("light", "dark")]
  [string] $ColorScheme = "light",

  [switch] $TestInvalidInput
)

$ErrorActionPreference = "Stop"
$cancellation = [System.Threading.CancellationToken]::None
$targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -Method Get
$target = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
if (-not $target) {
  throw "Chrome QA page target not available."
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$null = $socket.ConnectAsync(
  [Uri] $target.webSocketDebuggerUrl,
  $cancellation
).GetAwaiter().GetResult()
$sequence = 0

function Invoke-CdpCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Method,

    [hashtable] $Parameters = @{}
  )

  $script:sequence += 1
  $commandId = $script:sequence
  $json = @{
    id = $commandId
    method = $Method
    params = $Parameters
  } | ConvertTo-Json -Compress -Depth 12
  $payload = [Text.Encoding]::UTF8.GetBytes($json)
  $segment = [ArraySegment[byte]]::new($payload)
  $socket.SendAsync(
    $segment,
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    $cancellation
  ).GetAwaiter().GetResult()

  while ($true) {
    $stream = [IO.MemoryStream]::new()
    do {
      $buffer = [byte[]]::new(65536)
      $received = $socket.ReceiveAsync(
        [ArraySegment[byte]]::new($buffer),
        $cancellation
      ).GetAwaiter().GetResult()
      $stream.Write($buffer, 0, $received.Count)
    } until ($received.EndOfMessage)

    $response = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    $stream.Dispose()
    if ($response.id -eq $commandId) {
      if ($response.error) {
        throw "Chrome QA command failed."
      }
      return $response.result
    }
  }
}

try {
  Invoke-CdpCommand -Method "Page.enable" | Out-Null
  Invoke-CdpCommand -Method "Runtime.enable" | Out-Null
  Invoke-CdpCommand -Method "Emulation.setDeviceMetricsOverride" -Parameters @{
    width = $Width
    height = $Height
    deviceScaleFactor = 1
    mobile = $true
  } | Out-Null
  Invoke-CdpCommand -Method "Emulation.setEmulatedMedia" -Parameters @{
    features = @(
      @{ name = "prefers-reduced-motion"; value = "reduce" },
      @{ name = "prefers-color-scheme"; value = $ColorScheme }
    )
  } | Out-Null
  Invoke-CdpCommand -Method "Page.navigate" -Parameters @{
    url = "http://localhost:3000/accedi"
  } | Out-Null
  Start-Sleep -Seconds 3

  if ($TestInvalidInput) {
    $invalidInput = @'
(() => {
  const input = document.querySelector('#access-email');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!(input instanceof HTMLInputElement) || !setter || !input.form) return false;
  setter.call(input, 'indirizzo-incompleto');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.form.requestSubmit();
  return true;
})()
'@
    Invoke-CdpCommand -Method "Runtime.evaluate" -Parameters @{
      expression = $invalidInput
      returnByValue = $true
    } | Out-Null
    Start-Sleep -Milliseconds 300
  }

  $inspection = @'
(() => {
  const input = document.querySelector('#access-email');
  const button = document.querySelector('.email-access-form button');
  const card = document.querySelector('.auth-card');
  const helper = document.querySelector('.email-help');
  const fieldError = document.querySelector('.email-field-error');
  const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const luminance = (value) => {
    const channels = rgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (foreground, background) => {
    const first = luminance(foreground);
    const second = luminance(background);
    return Number(((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)).toFixed(2));
  };
  const cardStyle = card ? getComputedStyle(card) : null;
  const inputStyle = input ? getComputedStyle(input) : null;
  const helperStyle = helper ? getComputedStyle(helper) : null;
  const errorStyle = fieldError ? getComputedStyle(fieldError) : null;
  return JSON.stringify({
    viewport: { innerWidth, clientWidth: document.documentElement.clientWidth },
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
    fieldError: fieldError?.textContent?.trim() || null,
    inputHeight: input?.getBoundingClientRect().height || 0,
    buttonHeight: button?.getBoundingClientRect().height || 0,
    contrast: {
      input: inputStyle ? contrast(inputStyle.color, inputStyle.backgroundColor) : null,
      helper: helperStyle && cardStyle ? contrast(helperStyle.color, cardStyle.backgroundColor) : null,
      error: errorStyle && cardStyle ? contrast(errorStyle.color, cardStyle.backgroundColor) : null
    }
  });
})()
'@
  $evaluated = Invoke-CdpCommand -Method "Runtime.evaluate" -Parameters @{
    expression = $inspection
    returnByValue = $true
  }
  $metrics = $evaluated.result.value | ConvertFrom-Json

  if ($TestInvalidInput) {
    Invoke-CdpCommand -Method "Input.dispatchKeyEvent" -Parameters @{
      type = "keyDown"
      key = "Tab"
      code = "Tab"
      windowsVirtualKeyCode = 9
    } | Out-Null
    Invoke-CdpCommand -Method "Input.dispatchKeyEvent" -Parameters @{
      type = "keyUp"
      key = "Tab"
      code = "Tab"
      windowsVirtualKeyCode = 9
    } | Out-Null
    $focusResult = Invoke-CdpCommand -Method "Runtime.evaluate" -Parameters @{
      expression = "document.activeElement?.tagName || null"
      returnByValue = $true
    }
    $metrics | Add-Member -NotePropertyName focusAfterTab -NotePropertyValue $focusResult.result.value
  }

  $screenshot = Invoke-CdpCommand -Method "Page.captureScreenshot" -Parameters @{
    format = "png"
    captureBeyondViewport = $false
  }
  $screenshotDirectory = Split-Path -Parent $ScreenshotPath
  New-Item -ItemType Directory -Path $screenshotDirectory -Force | Out-Null
  [IO.File]::WriteAllBytes($ScreenshotPath, [Convert]::FromBase64String($screenshot.data))
  $metrics | ConvertTo-Json -Compress -Depth 6
}
finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync(
      [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
      "QA complete",
      $cancellation
    ).GetAwaiter().GetResult()
  }
  $socket.Dispose()
}
