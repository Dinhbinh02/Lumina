$JS_FILES = @(
    'lib/core/constants.js',
    'lib/helpers/annotation_utils.js',
    'lib/helpers/selection_utils.js',
    'lib/parsers/freedict_parser.js',
    'lib/ui/dictionary_popup.js',
    'lib/core/attachment_db.js',
    'lib/vendor/marked.min.js',
    'lib/vendor/highlight.min.js',
    'lib/vendor/katex/katex.min.js',
    'lib/vendor/katex/auto-render.min.js',
    'lib/vendor/chart.min.js',
    'lib/vendor/pdf.min.js',
    'lib/helpers/file_processor.js',
    'lib/ui/common.js',
    'lib/core/auth.js',
    'lib/core/highlight_db.js',
    'lib/core/chat_db.js',
    'lib/core/migration.js',
    'lib/core/chat_history.js',
    'lib/ui/history_panel.js',
    'lib/core/token_utils.js',
    'lib/core/memory.js',
    'pages/lumina/settings_modal.js',
    'pages/lumina/search_modal.js',
    'pages/lumina/lumina.js',
    'pages/lumina/sparks.js'
)

$CSS_FILES = @(
    'lib/vendor/katex/katex.min.css',
    'pages/lumina/lumina.css',
    'pages/lumina/settings_modal.css',
    'pages/lumina/search_modal.css'
)

$JS_BUNDLE = 'pages/lumina/lumina.bundle.js'
$CSS_BUNDLE = 'pages/lumina/lumina.bundle.css'

function Build-Bundles {
    Write-Host "Building bundles..."
    
    # Bundle JS
    $js_content = ""
    foreach ($f in $JS_FILES) {
        if (Test-Path $f) {
            $js_content += "`n// --- BUNDLED FROM: $f ---`n"
            $js_content += [System.IO.File]::ReadAllText($f) + "`n"
        } else {
            Write-Warning "File not found: $f"
        }
    }
    [System.IO.File]::WriteAllText($JS_BUNDLE, $js_content, [System.Text.Encoding]::UTF8)
    
    # Bundle CSS
    $css_content = ""
    foreach ($f in $CSS_FILES) {
        if (Test-Path $f) {
            $css_content += "`n/* --- BUNDLED FROM: $f --- */`n"
            $css_content += [System.IO.File]::ReadAllText($f) + "`n"
        } else {
            Write-Warning "File not found: $f"
        }
    }
    [System.IO.File]::WriteAllText($CSS_BUNDLE, $css_content, [System.Text.Encoding]::UTF8)
    
    Write-Host "Build complete!"
}

if ($args -contains "--watch") {
    Write-Host "Watching for changes..."
    Build-Bundles
    
    # Store last write times
    $mtimes = @{}
    $all_files = $JS_FILES + $CSS_FILES
    foreach ($f in $all_files) {
        if (Test-Path $f) {
            $mtimes[$f] = (Get-Item $f).LastWriteTime
        }
    }
    
    try {
        while ($true) {
            Start-Sleep -Milliseconds 500
            $changed = $false
            foreach ($f in $all_files) {
                if (Test-Path $f) {
                    $curr = (Get-Item $f).LastWriteTime
                    if (-not $mtimes.ContainsKey($f) -or $mtimes[$f] -ne $curr) {
                        $mtimes[$f] = $curr
                        Write-Host "File changed: $f"
                        $changed = $true
                    }
                }
            }
            if ($changed) {
                Build-Bundles
            }
        }
    } catch {
        Write-Host "Stopping watcher..."
    }
} else {
    Build-Bundles
}
