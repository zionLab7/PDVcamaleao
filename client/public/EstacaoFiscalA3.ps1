#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][uri]$PdvUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9A-Fa-f]{40}$')][string]$Thumbprint,
    [Parameter(Mandatory = $true)][ValidatePattern('^\d{14}$')][string]$Cnpj
)

$ErrorActionPreference = 'Stop'
if ($PdvUrl.Scheme -ne 'https' -or $PdvUrl.UserInfo -or $PdvUrl.AbsolutePath -ne '/' -or $PdvUrl.Query -or $PdvUrl.Fragment) {
    throw 'Informe somente a origem HTTPS do PDV, sem /api ou outro caminho.'
}
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$baseUrl = $PdvUrl.GetLeftPart([UriPartial]::Authority) + '/api/fiscal-a3'
$secret = Read-Host 'Token de vinculo gerado no PDV' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $apiHandler = [Net.Http.HttpClientHandler]::new()
    $apiHandler.AllowAutoRedirect = $false
    $api = [Net.Http.HttpClient]::new($apiHandler)
    $api.Timeout = [TimeSpan]::FromSeconds(30)
    $api.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new(
        'Bearer', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secret.Dispose()
}

function Invoke-Pdv([string]$Path, [hashtable]$Body) {
    $json = ConvertTo-Json -InputObject $Body -Compress
    $content = [Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
    try {
        $response = $api.PostAsync("$baseUrl/$Path", $content).GetAwaiter().GetResult()
        try {
            if ([int]$response.StatusCode -eq 401) { throw 'Token recusado. Gere outro vinculo e reabra a estacao.' }
            if (-not $response.IsSuccessStatusCode) { throw "PDV HTTP $([int]$response.StatusCode)." }
            if ([int]$response.StatusCode -eq 204) { return }
            $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            return ConvertFrom-Json -InputObject $raw
        } finally { $response.Dispose() }
    } finally { $content.Dispose() }
}

function Get-A3Certificate {
    $cert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$Thumbprint"
    if (-not $cert.HasPrivateKey -or $cert.NotBefore -gt (Get-Date) -or $cert.NotAfter -lt (Get-Date)) {
        throw 'Certificado fora da validade ou sem acesso a chave local.'
    }
    return $cert
}

function Get-SignedXml([string]$Xml, [string]$AccessKey, $Certificate) {
    $document = [Xml.XmlDocument]::new()
    $document.PreserveWhitespace = $true
    $document.XmlResolver = $null
    $document.LoadXml($Xml)
    $info = $document.DocumentElement.FirstChild
    if ($document.DocumentElement.LocalName -ne 'NFe' -or $info.LocalName -ne 'infNFe' -or
        $info.GetAttribute('Id') -ne "NFe$AccessKey" -or
        $info.SelectSingleNode("*[local-name()='emit']/*[local-name()='CNPJ']").InnerText -ne $Cnpj) {
        throw 'XML divergente do emitente configurado.'
    }
    $rsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($Certificate)
    if ($null -eq $rsa) { throw 'A chave RSA do cartao esta indisponivel.' }
    try {
        $signed = [Security.Cryptography.Xml.SignedXml]::new($document)
        $signed.SigningKey = $rsa
        $signed.SignedInfo.CanonicalizationMethod = [Security.Cryptography.Xml.SignedXml]::XmlDsigC14NTransformUrl
        $signed.SignedInfo.SignatureMethod = [Security.Cryptography.Xml.SignedXml]::XmlDsigRSASHA1Url
        $reference = [Security.Cryptography.Xml.Reference]::new("#NFe$AccessKey")
        $reference.DigestMethod = [Security.Cryptography.Xml.SignedXml]::XmlDsigSHA1Url
        $reference.AddTransform([Security.Cryptography.Xml.XmlDsigEnvelopedSignatureTransform]::new())
        $reference.AddTransform([Security.Cryptography.Xml.XmlDsigC14NTransform]::new())
        $signed.AddReference($reference)
        $signed.KeyInfo = [Security.Cryptography.Xml.KeyInfo]::new()
        $signed.KeyInfo.AddClause([Security.Cryptography.Xml.KeyInfoX509Data]::new($Certificate))
        $signed.ComputeSignature()
        $signature = $signed.GetXml().OuterXml
        return $Xml.Substring(0, $Xml.Length - '</NFe>'.Length) + $signature + '</NFe>'
    } finally { $rsa.Dispose() }
}

function Invoke-Sefaz($Job, [string]$Operation, [string]$Xml, $Certificate) {
    $tpAmb = if ($Job.environment -eq 'producao') { '1' } else { '2' }
    $subdomain = if ($Job.accessKey.Substring(20, 2) -eq '55') { 'nfe' } else { 'nfce' }
    $hostName = "$subdomain.fazenda.sp.gov.br"
    if ($tpAmb -eq '2') { $hostName = "homologacao.$hostName" }
    $ns = 'http://www.portalfiscal.inf.br/nfe'
    if ($Operation -eq 'query') {
        $service = 'NFeConsultaProtocolo4'
        $method = 'nfeConsultaNF'
        $payload = "<consSitNFe xmlns='$ns' versao='4.00'><tpAmb>$tpAmb</tpAmb><xServ>CONSULTAR</xServ><chNFe>$($Job.accessKey)</chNFe></consSitNFe>"
    } else {
        $service = 'NFeAutorizacao4'
        $method = 'nfeAutorizacaoLote'
        $batch = Get-Random -Minimum 10000000 -Maximum 99999999
        $payload = "<enviNFe xmlns='$ns' versao='4.00'><idLote>$batch</idLote><indSinc>1</indSinc>$Xml</enviNFe>"
    }
    $servicePath = if ($subdomain -eq 'nfe') { $service.ToLowerInvariant() + '.asmx' } else { $service + '.asmx' }
    $wsdl = "$ns/wsdl/$service"
    $soap = "<soap:Envelope xmlns:soap='http://www.w3.org/2003/05/soap-envelope'><soap:Body><nfeDadosMsg xmlns='$wsdl'>$payload</nfeDadosMsg></soap:Body></soap:Envelope>"
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.ClientCertificateOptions = [Net.Http.ClientCertificateOption]::Manual
    [void]$handler.ClientCertificates.Add($Certificate)
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    $content = [Net.Http.StringContent]::new($soap, [Text.Encoding]::UTF8, 'application/soap+xml')
    $content.Headers.ContentType.Parameters.Add([Net.Http.Headers.NameValueHeaderValue]::new('action', ('"' + "$wsdl/$method" + '"')))
    try {
        $response = $client.PostAsync("https://$hostName/ws/$servicePath", $content).GetAwaiter().GetResult()
        try {
            [void]$response.EnsureSuccessStatusCode()
            return $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        } finally { $response.Dispose() }
    } finally { $content.Dispose(); $client.Dispose() }
}

function Submit-PdvJob($Job, [hashtable]$Body) {
    $Body.leaseId = $Job.leaseId
    Invoke-Pdv "jobs/$($Job.saleId)" $Body
}

$certificate = Get-A3Certificate
Write-Host "Certificado selecionado: $($certificate.Subject)"
Write-Host "Aguardando vendas do CNPJ $Cnpj. Mantenha esta janela aberta."
try {
    while ($true) {
        try {
            $job = Invoke-Pdv 'next' @{}
        } catch {
            if ($_.Exception.Message -like 'Token recusado*') { throw }
            Write-Warning $_.Exception.Message
            Start-Sleep -Seconds 10
            continue
        }
        if ($null -eq $job) { Start-Sleep -Seconds 3; continue }
        try {
            if ($job.accessKey -notmatch ('^35\d{4}' + $Cnpj + '(55|65)\d{22}$') -or $job.environment -notin @('homologacao', 'producao')) {
                throw 'Solicitacao fora do escopo da estacao.'
            }
            Write-Host "Venda #$($job.sequenceNumber) | $($job.environment) | $($job.accessKey)"
            if ((Read-Host 'Digite S para prosseguir com esta solicitacao fiscal') -ne 'S') {
                throw 'Operacao cancelada na estacao Windows. Solicite novamente no PDV quando estiver pronto.'
            }
            $certificate = Get-A3Certificate
            $xml = $job.signedXml
            if (-not $xml) { $xml = Get-SignedXml $job.unsignedXml $job.accessKey $certificate }
            Submit-PdvJob $job @{ step = 'signed'; xml = $xml }
            $operation = 'authorization'
            if ($job.signedXml) {
                $operation = 'query'
                $response = Invoke-Sefaz $job $operation '' $certificate
                $result = [Xml.XmlDocument]::new()
                $result.XmlResolver = $null
                $result.LoadXml($response)
                $status = $result.SelectSingleNode("//*[local-name()='retConsSitNFe']/*[local-name()='cStat']")
                if ($status -and $status.InnerText -eq '217') { $operation = 'authorization' }
            }
            if ($operation -eq 'authorization') { $response = Invoke-Sefaz $job $operation $xml $certificate }
            Submit-PdvJob $job @{ step = 'result'; xml = $response; operation = $operation }
            Write-Host 'Resposta registrada. Confira o status no PDV.'
        } catch {
            Write-Warning $_.Exception.Message
            $message = 'A estacao nao concluiu a solicitacao. Confira o cartao, o PIN e a conexao no Windows e tente novamente no PDV.'
            try { Submit-PdvJob $job @{ step = 'error'; message = $message } } catch { Write-Warning $_.Exception.Message }
        }
    }
} finally { $api.Dispose() }
