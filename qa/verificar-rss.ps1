param([string]$OutputPath = 'qa/rss-viabilidad.json')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$sources = @(
  @{ id = 'iprofesional'; url = 'https://www.iprofesional.com/rss/economia' },
  @{ id = 'eleconomista'; url = 'https://eleconomista.com.ar/economia/feed/' },
  @{ id = 'pagina12'; url = 'https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas/' },
  @{ id = 'infobae'; url = 'https://www.infobae.com/arc/outboundfeeds/rss/' },
  @{ id = 'bloomberg'; url = 'https://www.bloomberg.com/feeds/economics/news.rss' },
  @{ id = 'bloomberg-alternative'; url = 'https://feeds.bloomberg.com/news.rss' }
)
$allowedHosts = @('www.iprofesional.com', 'iprofesional.com', 'eleconomista.com.ar', 'www.eleconomista.com.ar', 'www.pagina12.com.ar', 'pagina12.com.ar', 'www.infobae.com', 'infobae.com', 'www.bloomberg.com', 'bloomberg.com', 'feeds.bloomberg.com')
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(15)
$client.DefaultRequestHeaders.UserAgent.ParseAdd('Flujario-Feed-Check/1.0')
$results = @()
try {
  foreach ($source in $sources) {
    $result = [ordered]@{ source = $source.id; requestedUrl = $source.url; checkedAt = [DateTimeOffset]::UtcNow.ToString('o'); httpStatus = $null; finalUrl = $source.url; redirects = @(); contentType = $null; xmlValid = $null; format = $null; itemCount = 0; missingDates = 0; invalidDates = 0; futureDates = 0; itemsInLast7Days = 0; latestPublishedAt = $null; categorySamples = @(); itemElementNames = @(); articleSectionPaths = @(); economyPathMatches = 0; itemsWithImageMetadata = 0; error = $null }
    try {
      $target = [Uri]$source.url
      for ($redirectCount = 0; $redirectCount -le 3; $redirectCount++) {
        if ($target.Scheme -ne 'https' -or $target.Host -notin $allowedHosts) { throw 'Redirect outside official HTTPS allowlist.' }
        $response = $client.GetAsync($target, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $result.httpStatus = [int]$response.StatusCode
        $result.finalUrl = $target.AbsoluteUri
        $result.contentType = [string]$response.Content.Headers.ContentType
        if ([int]$response.StatusCode -notin @(301,302,303,307,308)) { break }
        if ($redirectCount -eq 3 -or !$response.Headers.Location) { throw 'Redirect limit or missing target.' }
        $target = [Uri]::new($target, $response.Headers.Location)
        $result.redirects += $target.AbsoluteUri
        $response.Dispose()
      }
      if (!$response.IsSuccessStatusCode) { $result.error = 'HTTP error; no workaround attempted.'; continue }
      $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
      $buffer = [byte[]]::new(8192)
      $memory = [System.IO.MemoryStream]::new()
      try {
        while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
          if (($memory.Length + $read) -gt 2097152) { throw 'Feed exceeds 2 MiB verification limit.' }
          $memory.Write($buffer, 0, $read)
        }
        $memory.Position = 0
        $settings = [System.Xml.XmlReaderSettings]::new()
        $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
        $settings.XmlResolver = $null
        $settings.MaxCharactersInDocument = 2097152
        $reader = [System.Xml.XmlReader]::Create($memory, $settings)
        $document = [System.Xml.XmlDocument]::new()
        $document.XmlResolver = $null
        try { $document.Load($reader); $result.xmlValid = $true } catch { $result.xmlValid = $false; throw 'Invalid XML or prohibited DTD.' }
        $result.format = $document.DocumentElement.LocalName
        if ($result.format -notin @('rss', 'feed', 'RDF')) { throw 'XML is not RSS/Atom.' }
        $items = $document.SelectNodes('/*[local-name()="rss"]/*[local-name()="channel"]/*[local-name()="item"] | /*[local-name()="feed"]/*[local-name()="entry"] | /*[local-name()="RDF"]/*[local-name()="item"]')
        $result.itemCount = $items.Count
        $dates = @()
        $categories = @()
        $elementNames = @()
        $sections = @()
        $now = [DateTimeOffset]::UtcNow
        foreach ($item in $items) {
          $elementNames += @($item.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element } | ForEach-Object { $_.Name })
          $linkNode = $item.SelectSingleNode('*[local-name()="link"]')
          if ($linkNode) {
            $linkText = if ($linkNode.HasAttribute('href')) { $linkNode.GetAttribute('href') } else { $linkNode.InnerText }
            $articleUri = $null
            if ([Uri]::TryCreate($linkText, [UriKind]::Absolute, [ref]$articleUri)) {
              $segments = @($articleUri.AbsolutePath.Split('/', [System.StringSplitOptions]::RemoveEmptyEntries))
              if ($segments.Count -gt 0) { $sections += $segments[0] }
              if ($articleUri.Host -eq 'www.infobae.com' -and $articleUri.AbsolutePath.StartsWith('/economia/')) { $result.economyPathMatches++ }
            }
          }
          $dateNode = $item.SelectSingleNode('*[local-name()="pubDate" or local-name()="published" or local-name()="date"]')
          if (!$dateNode) { $dateNode = $item.SelectSingleNode('*[local-name()="updated"]') }
          if (!$dateNode) { $result.missingDates++ } else {
            $parsed = [DateTimeOffset]::MinValue
            if ([DateTimeOffset]::TryParse($dateNode.InnerText, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AllowWhiteSpaces, [ref]$parsed)) {
              $dates += $parsed.ToUniversalTime().ToString('o')
              if ($parsed -gt $now.AddMinutes(5)) { $result.futureDates++ }
              if ($parsed -le $now.AddMinutes(5) -and $parsed -ge $now.AddDays(-7)) { $result.itemsInLast7Days++ }
            } else { $result.invalidDates++ }
          }
          foreach ($category in $item.SelectNodes('*[local-name()="category"]')) {
            $label = if ($category.HasAttribute('term')) { $category.GetAttribute('term') } else { $category.InnerText }
            if ($label.Length -le 120) { $categories += $label }
          }
          if ($item.SelectSingleNode('*[local-name()="thumbnail" or local-name()="content"][@url] | *[local-name()="enclosure"][starts-with(@type,"image/")]')) { $result.itemsWithImageMetadata++ }
        }
        if ($dates.Count -gt 0) { $result.latestPublishedAt = @($dates | Sort-Object -Descending)[0] }
        $result.categorySamples = @($categories | Select-Object -Unique | Select-Object -First 20)
        $result.itemElementNames = @($elementNames | Select-Object -Unique)
        $result.articleSectionPaths = @($sections | Group-Object | Sort-Object Count -Descending | ForEach-Object { @{ path = $_.Name; count = $_.Count } })
      } finally { $memory.Dispose(); $stream.Dispose() }
    } catch { $result.error = $_.Exception.Message } finally {
      if ($response) { $response.Dispose(); $response = $null }
      $results += [PSCustomObject]$result
      Write-Output ([PSCustomObject]$result | ConvertTo-Json -Depth 5 -Compress)
    }
  }
} finally { $client.Dispose() }
$report = @{ purpose = 'Technical RSS feasibility; no republication permission is implied.'; freshnessWindowDays = 7; results = $results }
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $OutputPath), ($report | ConvertTo-Json -Depth 7), [System.Text.UTF8Encoding]::new($false))
