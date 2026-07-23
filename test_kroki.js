const fs = require('fs');

async function run() {
    let source = `vars: {
  d2-config: {
    theme-id: 5
    pad: 30
  }
}
direction: right
title: {
  label: "Quy trình xác định Element cho Playwright"
  style.bold: true
  style.font-size: 16
  style.stroke-width: 0
  style.fill: none
}
DevTools: "Mở DevTools (F12)" {
  shape: browser
}
DOM: "Soi thẻ HTML trong DOM" {
  shape: document
}
Locator: "Chọn Locator phù hợp" {
  shape: hexagon
  style.3d: true
}
Playwright: "Ghi mã Playwright" {
  shape: rectangle
  style.shadow: true
}

DevTools -> DOM: "Dùng công cụ Inspector (Ctrl+Shift+C)" { style.animated: true }
DOM -> Locator: "Phân tích thuộc tính (role, label, id, class)" { style.animated: true }
Locator -> Playwright: "Tạo lệnh getBy... hoặc locator()" { style.animated: true }`;

    source = source
        .replace(/style\.fill:\s*none/gi, 'style.fill: transparent')
        .replace(/shape:\s*browser/gi, 'shape: rectangle')
        .replace(/shape:\s*page/gi, 'shape: document');

    const res = await fetch('https://kroki.io/d2/svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagram_source: source })
    });
    console.log('STATUS:', res.status);
    if (!res.ok) {
        console.log('ERROR:', await res.text());
    } else {
        console.log('SUCCESS SVG length:', (await res.text()).length);
    }
}

run();
