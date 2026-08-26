$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $ScriptDir) { $ScriptDir = Get-Location }

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
    'lib/core/gemini_live.js',
    'lib/core/notes_manager.js',
    'lib/ui/notes_panel.js',
    'lib/core/tts_manager.js',
    'lib/ui/tts_panel.js',
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

$JS_BUNDLE = Join-Path $ScriptDir "pages/lumina/lumina.bundle.js"
$CSS_BUNDLE = Join-Path $ScriptDir "pages/lumina/lumina.bundle.css"

function Invoke-LuminaBuild {
    Write-Host "Building bundles..."

    $entryPath = Join-Path $ScriptDir "tools/blocknote_entry.jsx"
    if (Test-Path $entryPath) {
        try {
            Write-Host "Compiling tools/blocknote_entry.jsx with esbuild..."
            & npx esbuild tools/blocknote_entry.jsx --bundle --outfile=lib/vendor/blocknote.js --loader:.js=jsx --loader:.jsx=jsx --conditions=style '--define:process.env.NODE_ENV=\"production\"'
        } catch {
            Write-Warning "esbuild compilation skipped or failed: $_"
        }
    }
    
    # Bundle JS
    $js_content = ""
    foreach ($f in $JS_FILES) {
        $fullPath = Join-Path $ScriptDir $f
        if (Test-Path $fullPath) {
            $js_content += "`n// --- BUNDLED FROM: $f ---`n"
            $js_content += [System.IO.File]::ReadAllText($fullPath) + "`n"
        } else {
            Write-Warning "File not found: $fullPath"
        }
    }
    [System.IO.File]::WriteAllText($JS_BUNDLE, $js_content, [System.Text.Encoding]::UTF8)
    
    # Bundle CSS
    $css_content = ""
    foreach ($f in $CSS_FILES) {
        $fullPath = Join-Path $ScriptDir $f
        if (Test-Path $fullPath) {
            $css_content += "`n/* --- BUNDLED FROM: $f --- */`n"
            $css_content += [System.IO.File]::ReadAllText($fullPath) + "`n"
        } else {
            Write-Warning "File not found: $fullPath"
        }
    }
    [System.IO.File]::WriteAllText($CSS_BUNDLE, $css_content, [System.Text.Encoding]::UTF8)
    
    Write-Host "Build complete!"
}

if ($args -contains "--watch") {
    Write-Host "Watching for changes..."
    Invoke-LuminaBuild
    
    # Store last write times
    $mtimes = @{}
    $all_files = $JS_FILES + $CSS_FILES
    foreach ($f in $all_files) {
        $fullPath = Join-Path $ScriptDir $f
        if (Test-Path $fullPath) {
            $mtimes[$f] = (Get-Item $fullPath).LastWriteTime
        }
    }
    
    try {
        while ($true) {
            Start-Sleep -Milliseconds 500
            $changed = $false
            foreach ($f in $all_files) {
                $fullPath = Join-Path $ScriptDir $f
                if (Test-Path $fullPath) {
                    $curr = (Get-Item $fullPath).LastWriteTime
                    if (-not $mtimes.ContainsKey($f) -or $mtimes[$f] -ne $curr) {
                        $mtimes[$f] = $curr
                        Write-Host "File changed: $f"
                        $changed = $true
                    }
                }
            }
            if ($changed) {
                Invoke-LuminaBuild
            }
        }
    } catch {
        Write-Host "Stopping watcher..."
    }
}

Invoke-LuminaBuild
