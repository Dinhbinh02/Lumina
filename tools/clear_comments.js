const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function getFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file !== 'vendor' && file !== 'node_modules' && !file.startsWith('.')) {
                getFiles(filePath, fileList);
            }
        } else {
            const ext = path.extname(file);
            if (['.js', '.css', '.html'].includes(ext)) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

function stripJSComments(code) {
  let inString = null;
  let inRegex = false;
  let inComment = null;
  let escaped = false;
  let result = '';
  for (let i = 0; i < code.length; i++) {
    let char = code[i];
    let nextChar = code[i + 1] || '';
    if (inComment === 'single') {
      if (char === '\n' || char === '\r') {
        inComment = null;
        result += char;
      }
      continue;
    }
    if (inComment === 'multi') {
      if (char === '*' && nextChar === '/') {
        inComment = null;
        i++;
      }
      continue;
    }
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (inRegex) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '/') {
        inRegex = false;
      }
      continue;
    }
    if (char === '/' && nextChar === '/') {
      inComment = 'single';
      i++;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inComment = 'multi';
      i++;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = char;
      result += char;
      escaped = false;
      continue;
    }
    if (char === '/') {
      let prevCode = result.trim();
      let lastChar = prevCode[prevCode.length - 1];
      let isRegex = false;
      if (lastChar) {
        if ('(=[,!&|?:{};~+-*%/'.includes(lastChar) || prevCode.endsWith('return') || prevCode.endsWith('yield') || prevCode.endsWith('throw') || prevCode.endsWith('typeof') || prevCode.endsWith('delete') || prevCode.endsWith('void')) {
          isRegex = true;
        }
      } else {
        isRegex = true;
      }
      if (isRegex) {
        inRegex = true;
        result += char;
        escaped = false;
        continue;
      }
    }
    result += char;
  }
  return result;
}

function stripCSSComments(code) {
  let inString = null;
  let inComment = false;
  let escaped = false;
  let result = '';
  for (let i = 0; i < code.length; i++) {
    let char = code[i];
    let nextChar = code[i + 1] || '';
    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      result += char;
      escaped = false;
      continue;
    }
    result += char;
  }
  return result;
}

function stripHTMLComments(code) {
  let result = '';
  let i = 0;
  while (i < code.length) {
    if (code.substr(i, 4) === '<!--') {
      let endIdx = code.indexOf('-->', i + 4);
      if (endIdx !== -1) {
        i = endIdx + 3;
        continue;
      }
    }
    result += code[i];
    i++;
  }
  return result;
}

function stripCommentsFromHTML(html) {
  let parsed = stripHTMLComments(html);
  parsed = parsed.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (match, openTag, content, closeTag) => {
    return openTag + stripJSComments(content) + closeTag;
  });
  parsed = parsed.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, openTag, content, closeTag) => {
    return openTag + stripCSSComments(content) + closeTag;
  });
  return parsed;
}

function processFiles() {
  const files = getFiles(rootDir);
  console.log(`Found ${files.length} files to process.`);
  let count = 0;
  for (const file of files) {
    const ext = path.extname(file);
    const content = fs.readFileSync(file, 'utf8');
    let strippedContent = '';
    if (ext === '.js') {
      strippedContent = stripJSComments(content);
    } else if (ext === '.css') {
      strippedContent = stripCSSComments(content);
    } else if (ext === '.html') {
      strippedContent = stripCommentsFromHTML(content);
    } else {
      continue;
    }
    let lines = strippedContent.split('\n');
    lines = lines.map(line => line.trimRight());
    let cleanedLines = [];
    if (ext === '.js' || ext === '.css') {
        let depth = 0;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmed = line.trim();
            let openBraces = 0;
            let closeBraces = 0;
            let inString = null;
            let escaped = false;
            for (let charIndex = 0; charIndex < line.length; charIndex++) {
                let char = line[charIndex];
                if (inString) {
                    if (escaped) {
                        escaped = false;
                    } else if (char === '\\') {
                        escaped = true;
                    } else if (char === inString) {
                        inString = null;
                    }
                } else {
                    if (char === "'" || char === '"' || char === '`') {
                        inString = char;
                        escaped = false;
                    } else if (char === '{') {
                        openBraces++;
                    } else if (char === '}') {
                        closeBraces++;
                    }
                }
            }
            let nextDepth = depth + openBraces - closeBraces;
            if (trimmed === '') {
                if (depth > 0) {
                    continue;
                }
            }
            depth = Math.max(0, nextDepth);
            cleanedLines.push(line);
        }
    } else {
        cleanedLines = lines;
    }
    let finalLines = [];
    let consecutiveEmptyCount = 0;
    for (let line of cleanedLines) {
        if (line === '') {
            consecutiveEmptyCount++;
        } else {
            consecutiveEmptyCount = 0;
        }
        if (consecutiveEmptyCount <= 1) {
            finalLines.push(line);
        }
    }
    strippedContent = finalLines.join('\n');
    if (content !== strippedContent) {
      fs.writeFileSync(file, strippedContent, 'utf8');
      console.log(`Cleared comments & formatted blank lines in: ${path.relative(rootDir, file)}`);
      count++;
    }
  }
  console.log(`Successfully processed and formatted ${count} files.`);
}

processFiles();
