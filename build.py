import os
import sys
import time

JS_FILES = [
    'lib/core/constants.js',
    'lib/helpers/annotation_utils.js',
    'lib/helpers/selection_utils.js',
    'lib/parsers/freedict_parser.js',
    'lib/ui/dictionary_popup.js',
    'lib/core/attachment_db.js',
    'lib/ui/common.js',
    'lib/core/auth.js',
    'lib/core/chat_history.js',
    'lib/ui/history_panel.js',
    'lib/core/token_utils.js',
    'lib/core/memory.js',
    'pages/lumina/settings_modal.js',
    'pages/lumina/search_modal.js',
    'pages/lumina/lumina.js',
    'pages/lumina/sparks.js'
]

CSS_FILES = [
    'pages/lumina/lumina.css',
    'pages/lumina/settings_modal.css',
    'pages/lumina/search_modal.css'
]

JS_BUNDLE = 'pages/lumina/lumina.bundle.js'
CSS_BUNDLE = 'pages/lumina/lumina.bundle.css'

def build():
    print("Building bundles...")
    # Bundle JS
    js_content = ""
    for f in JS_FILES:
        if os.path.exists(f):
            with open(f, 'r', encoding='utf-8') as file:
                js_content += f"\n// --- BUNDLED FROM: {f} ---\n"
                js_content += file.read() + "\n"
        else:
            print(f"Warning: {f} not found!")
    
    with open(JS_BUNDLE, 'w', encoding='utf-8') as out:
        out.write(js_content)
    
    # Bundle CSS
    css_content = ""
    for f in CSS_FILES:
        if os.path.exists(f):
            with open(f, 'r', encoding='utf-8') as file:
                css_content += f"\n/* --- BUNDLED FROM: {f} --- */\n"
                css_content += file.read() + "\n"
        else:
            print(f"Warning: {f} not found!")
            
    with open(CSS_BUNDLE, 'w', encoding='utf-8') as out:
        out.write(css_content)
        
    print("Build complete!")

def watch():
    print("Watching for changes...")
    build()
    
    # Track modification times
    mtimes = {}
    all_files = JS_FILES + CSS_FILES
    for f in all_files:
        if os.path.exists(f):
            mtimes[f] = os.path.getmtime(f)
            
    try:
        while True:
            time.sleep(0.5)
            changed = False
            for f in all_files:
                if os.path.exists(f):
                    current_mtime = os.path.getmtime(f)
                    if f not in mtimes or current_mtime != mtimes[f]:
                        mtimes[f] = current_mtime
                        print(f"File changed: {f}")
                        changed = True
            if changed:
                build()
    except KeyboardInterrupt:
        print("Stopping watcher...")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--watch":
        watch()
    else:
        build()
