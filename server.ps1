$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$port = 3000
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)

$mimeTypes = @{
    '.css' = 'text/css; charset=utf-8'
    '.html' = 'text/html; charset=utf-8'
    '.ico' = 'image/x-icon'
    '.jpeg' = 'image/jpeg'
    '.jpg' = 'image/jpeg'
    '.js' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png' = 'image/png'
    '.svg' = 'image/svg+xml'
    '.webp' = 'image/webp'
}

try {
    $listener.Start()
} catch {
    $probe = New-Object System.Net.Sockets.TcpClient
    try {
        $probe.Connect([System.Net.IPAddress]::Loopback, $port)
        $url = "http://localhost:$port/"
        Write-Host "Сайт уже запущен: $url"
        Start-Process $url
        exit 0
    } catch {
        Write-Host "Не удалось запустить сервер на порту $port."
        Write-Host $_.Exception.Message
        Read-Host 'Нажмите Enter для выхода'
        exit 1
    } finally {
        $probe.Dispose()
    }
}

$url = "http://localhost:$port/"
Write-Host "AthleteMenu открыт: $url"
Write-Host 'Чтобы остановить сервер, закройте это окно.'
Start-Process $url

try {
    while ($listener.Server.IsBound) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($null -ne ($header = $reader.ReadLine()) -and $header.Length -gt 0) { }

            $status = '200 OK'
            $body = [byte[]]@()
            $contentType = 'application/octet-stream'
            try {
                if ($requestLine -notmatch '^GET\s+(\S+)\s+HTTP/\d(?:\.\d)?$') { throw 'Bad request' }
                $requestPath = ([System.Uri]::UnescapeDataString(($Matches[1] -split '\?', 2)[0])).TrimStart('/')
                if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = 'index.html' }
                $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $requestPath))
                if (-not $filePath.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $status = '403 Forbidden'
                    $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                } elseif (-not [System.IO.File]::Exists($filePath)) {
                    $status = '404 Not Found'
                    $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                } else {
                    $body = [System.IO.File]::ReadAllBytes($filePath)
                    $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
                    if ($mimeTypes.ContainsKey($extension)) { $contentType = $mimeTypes[$extension] }
                }
            } catch {
                if ($status -eq '200 OK') { $status = '400 Bad Request' }
                $body = [System.Text.Encoding]::UTF8.GetBytes('Bad request')
            }

            $responseHeader = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($responseHeader)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
            $stream.Flush()
        } catch {
            Write-Host "Ошибка запроса: $($_.Exception.Message)"
        } finally {
            if ($client) { $client.Dispose() }
        }
    }
} finally {
    $listener.Stop()
}


