const LuminaFileProcessor = {
    createAttachmentId() {
        return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    },

    isPdfFile(file) {
        const name = (file?.name || '').toLowerCase();
        const mime = (file?.type || '').toLowerCase();
        return mime === 'application/pdf' || name.endsWith('.pdf');
    },

    isXlsxFile(file) {
        const name = (file?.name || '').toLowerCase();
        const mime = (file?.type || '').toLowerCase();
        return mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || name.endsWith('.xlsx');
    },

    isDocxFile(file) {
        const name = (file?.name || '').toLowerCase();
        const mime = (file?.type || '').toLowerCase();
        return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx');
    },

    async readFileAsDataUrl(file) {
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    },

    async fileToDataURL(file) {
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    },

    compressImage(dataUrl, maxWidth = 2048, maxHeight = 2048, quality = 0.9) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                let currentQuality = quality;
                let currentScale = 1.0;
                let resultDataUrl = dataUrl;
                let attempts = 0;
                const maxAttempts = 4;
                const targetMaxBytes = 150 * 1024;
                
                const compressAttempt = () => {
                    const w = Math.round(width * currentScale);
                    const h = Math.round(height * currentScale);
                    canvas.width = w;
                    canvas.height = h;
                    ctx.clearRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    const attemptUrl = canvas.toDataURL('image/webp', currentQuality);
                    const commaIdx = attemptUrl.indexOf(',');
                    const base64Len = commaIdx !== -1 ? attemptUrl.length - (commaIdx + 1) : attemptUrl.length;
                    const approxBytes = base64Len * 0.75;
                    
                    resultDataUrl = attemptUrl;
                    
                    if (approxBytes > targetMaxBytes && attempts < maxAttempts) {
                        attempts++;
                        if (attempts % 2 === 1) {
                            currentQuality = Math.max(0.4, currentQuality - 0.07);
                        } else {
                            currentScale = Math.max(0.5, currentScale - 0.2);
                        }
                        compressAttempt();
                    } else {
                        resolve(resultDataUrl);
                    }
                };
                compressAttempt();
            };
            img.onerror = () => {
                resolve(dataUrl);
            };
            img.src = dataUrl;
        });
    },

    createObjectUrlFromDataUrl(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) return null;
        const header = dataUrl.slice(0, commaIdx);
        const base64 = dataUrl.slice(commaIdx + 1);
        const mimeMatch = header.match(/^data:([^;]+);base64$/i);
        if (!mimeMatch) return null;
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mimeMatch[1] || 'application/octet-stream' });
            return URL.createObjectURL(blob);
        } catch (error) {
            console.warn('Failed to build preview blob URL:', error);
            return null;
        }
    },

    resolveImagePreviewSrc(item, src) {
        if (!src || typeof src !== 'string') return src;
        if (!src.startsWith('data:image/')) return src;
        if (item && typeof item === 'object' && item._luminaBlobUrl) {
            return item._luminaBlobUrl;
        }
        const blobUrl = LuminaFileProcessor.createObjectUrlFromDataUrl(src);
        if (blobUrl && item && typeof item === 'object') {
            item._luminaBlobUrl = blobUrl;
        }
        return blobUrl || src;
    },

    async prepareRawFileAttachment(file, createObjectUrlCallback) {
        const dataUrl = await LuminaFileProcessor.readFileAsDataUrl(file);
        if (!dataUrl) return null;
        const mimeType = file.type;
        const isImage = mimeType.startsWith('image/');
        const isVideo = mimeType.startsWith('video/');
        const isAudio = mimeType.startsWith('audio/');
        const isPDF = mimeType === 'application/pdf';
        const fileObj = {
            mimeType,
            name: file.name,
            isImage,
            isVideo,
            isAudio,
            isPDF,
            dataUrl
        };
        if (isImage && createObjectUrlCallback) {
            fileObj.previewUrl = createObjectUrlCallback(file);
        }
        return fileObj;
    },

    async extractPdfAsAttachments(file) {
        if (typeof pdfjsLib === 'undefined') {
            console.error('[Lumina] pdfjsLib is not loaded');
            throw new Error('pdfjsLib is not loaded');
        }
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/vendor/pdf.worker.min.js');
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const textPages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items
                .filter(item => 'str' in item && typeof item.str === 'string')
                .map(item => item.str);
            const pageText = strings.reduce((acc, str) => {
                if (str === '') return acc + '\n';
                if (str === ' ') return acc + str;
                if (/\w-$/.test(acc) && /^\w/.test(str)) return acc.slice(0, -1) + str;
                if (/\S$/.test(acc)) return acc + ' ' + str;
                return acc + str;
            }, '');
            textPages.push(pageText);
        }
        const text = textPages.join('\n\n');
        const baseName = (file.name || 'document').replace(/\.[^.]+$/, '');
        const attachments = [];
        if (text.trim()) {
            const dataUrl = LuminaFileProcessor.textToDataUrl(text, 'text/plain');
            attachments.push({
                mimeType: 'text/plain',
                name: `${baseName}.txt`,
                isImage: false,
                dataUrl,
                data: dataUrl.split(',')[1] || ''
            });
        }
        return attachments;
    },

    async extractXlsxAsAttachments(file) {
        const entries = await LuminaFileProcessor.readZipEntries(await file.arrayBuffer());
        const workbookXml = LuminaFileProcessor.decodeUtf8(entries['xl/workbook.xml']);
        if (!workbookXml) return [];
        const workbookRelsXml = LuminaFileProcessor.decodeUtf8(entries['xl/_rels/workbook.xml.rels']);
        const sharedStringsXml = LuminaFileProcessor.decodeUtf8(entries['xl/sharedStrings.xml']);
        const sharedStrings = LuminaFileProcessor.parseSharedStrings(sharedStringsXml);
        const sheetPathByRelId = LuminaFileProcessor.parseWorkbookRelationships(workbookRelsXml);
        const parser = new DOMParser();
        const workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
        const sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'));
        const baseName = (file.name || 'workbook').replace(/\.[^.]+$/, '');
        const attachments = [];
        sheetNodes.forEach((sheetNode, idx) => {
            const relId = sheetNode.getAttribute('r:id');
            const targetPath = relId ? sheetPathByRelId[relId] : '';
            const fallbackPath = `xl/worksheets/sheet${idx + 1}.xml`;
            const sheetPath = targetPath && entries[targetPath] ? targetPath : fallbackPath;
            const sheetXml = LuminaFileProcessor.decodeUtf8(entries[sheetPath]);
            if (!sheetXml) return;
            const sheetName = sheetNode.getAttribute('name') || `Sheet${idx + 1}`;
            const csv = LuminaFileProcessor.sheetXmlToCsv(sheetXml, sharedStrings);
            if (!csv) return;
            const csvName = `${baseName} - ${sheetName}.csv`.replace(/[\\/:*?"<>|]/g, '_');
            const dataUrl = LuminaFileProcessor.textToDataUrl(csv, 'text/csv');
            const base64Data = dataUrl.split(',')[1] || '';
            attachments.push({
                mimeType: 'text/csv',
                name: csvName,
                isImage: false,
                dataUrl,
                data: base64Data
            });
        });
        return attachments;
    },

    async extractDocxAsAttachments(file) {
        const entries = await LuminaFileProcessor.readZipEntries(await file.arrayBuffer());
        const docXml = LuminaFileProcessor.decodeUtf8(entries['word/document.xml']);
        const baseName = (file.name || 'document').replace(/\.[^.]+$/, '');
        const attachments = [];
        if (docXml) {
            const text = LuminaFileProcessor.docxXmlToText(docXml);
            if (text.trim()) {
                const dataUrl = LuminaFileProcessor.textToDataUrl(text, 'text/plain');
                attachments.push({
                    mimeType: 'text/plain',
                    name: `${baseName}.txt`,
                    isImage: false,
                    dataUrl,
                    data: dataUrl.split(',')[1] || ''
                });
            }
        }
        Object.keys(entries).forEach((path) => {
            if (!path.startsWith('word/media/')) return;
            const mimeType = LuminaFileProcessor.mimeFromExtension(path);
            if (!mimeType || !mimeType.startsWith('image/')) return;
            const bytes = entries[path];
            const dataUrl = LuminaFileProcessor.bytesToDataUrl(bytes, mimeType);
            const fileName = path.split('/').pop() || 'image';
            attachments.push({
                mimeType,
                name: `${baseName} - ${fileName}`,
                isImage: true,
                dataUrl,
                data: dataUrl.split(',')[1] || '',
                previewUrl: LuminaFileProcessor.resolveImagePreviewSrc(null, dataUrl)
            });
        });
        return attachments;
    },

    parseWorkbookRelationships(xml) {
        if (!xml) return {};
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const relNodes = Array.from(doc.getElementsByTagName('Relationship'));
        const out = {};
        relNodes.forEach((node) => {
            const id = node.getAttribute('Id');
            const target = node.getAttribute('Target') || '';
            if (!id || !target) return;
            const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
            out[id] = normalized.replace(/\\/g, '/');
        });
        return out;
    },

    parseSharedStrings(xml) {
        if (!xml) return [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const siNodes = Array.from(doc.getElementsByTagName('si'));
        return siNodes.map((si) => {
            const tNodes = Array.from(si.getElementsByTagName('t'));
            return tNodes.map((t) => t.textContent || '').join('');
        });
    },

    sheetXmlToCsv(sheetXml, sharedStrings) {
        if (!sheetXml) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(sheetXml, 'application/xml');
        const rowNodes = Array.from(doc.getElementsByTagName('row'));
        const lines = [];
        rowNodes.forEach((rowNode) => {
            const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
            const rowValues = [];
            cellNodes.forEach((cell) => {
                const ref = cell.getAttribute('r') || '';
                const t = (cell.getAttribute('t') || '').toLowerCase();
                const vNode = cell.getElementsByTagName('v')[0];
                const isNode = cell.getElementsByTagName('is')[0];
                let value = '';
                if (t === 's' && vNode) {
                    const idx = parseInt(vNode.textContent || '0', 10);
                    value = Number.isFinite(idx) ? (sharedStrings[idx] || '') : '';
                } else if (t === 'inlineStr' && isNode) {
                    value = Array.from(isNode.getElementsByTagName('t')).map((n) => n.textContent || '').join('');
                } else if (vNode) {
                    value = vNode.textContent || '';
                }
                const colIdx = LuminaFileProcessor.columnRefToIndex(ref);
                rowValues[colIdx] = LuminaFileProcessor.escapeCsv(value);
            });
            let last = rowValues.length - 1;
            while (last >= 0 && (rowValues[last] === undefined || rowValues[last] === '')) last -= 1;
            if (last < 0) {
                lines.push('');
            } else {
                lines.push(rowValues.slice(0, last + 1).map((v) => v || '').join(','));
            }
        });
        return lines.join('\n');
    },

    columnRefToIndex(ref) {
        const match = String(ref || '').match(/[A-Z]+/i);
        if (!match) return 0;
        const letters = match[0].toUpperCase();
        let idx = 0;
        for (let i = 0; i < letters.length; i++) {
            idx = idx * 26 + (letters.charCodeAt(i) - 64);
        }
        return Math.max(0, idx - 1);
    },

    escapeCsv(value) {
        const raw = String(value == null ? '' : value);
        if (/[",\n\r]/.test(raw)) {
            return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
    },

    docxXmlToText(xml) {
        if (!xml) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
        const out = [];
        paragraphs.forEach((p) => {
            const text = Array.from(p.getElementsByTagName('w:t')).map((n) => n.textContent || '').join('');
            out.push(text);
        });
        return out.join('\n').replace(/\n{3,}/g, '\n\n');
    },

    async readZipEntries(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);
        const eocdOffset = LuminaFileProcessor.findEocdOffset(view);
        if (eocdOffset < 0) throw new Error('Invalid ZIP: EOCD not found');
        const centralDirSize = view.getUint32(eocdOffset + 12, true);
        const centralDirOffset = view.getUint32(eocdOffset + 16, true);
        const entries = {};
        let ptr = centralDirOffset;
        const end = centralDirOffset + centralDirSize;
        while (ptr + 46 <= end && view.getUint32(ptr, true) === 0x02014b50) {
            const compression = view.getUint16(ptr + 10, true);
            const compressedSize = view.getUint32(ptr + 20, true);
            const nameLen = view.getUint16(ptr + 28, true);
            const extraLen = view.getUint16(ptr + 30, true);
            const commentLen = view.getUint16(ptr + 32, true);
            const localHeaderOffset = view.getUint32(ptr + 42, true);
            const nameBytes = bytes.slice(ptr + 46, ptr + 46 + nameLen);
            const fileName = new TextDecoder('utf-8').decode(nameBytes).replace(/\\/g, '/');
            if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                ptr += 46 + nameLen + extraLen + commentLen;
                continue;
            }
            const localNameLen = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
            if (compression === 0) {
                entries[fileName] = new Uint8Array(compressedBytes);
            } else if (compression === 8) {
                entries[fileName] = await LuminaFileProcessor.inflateRaw(compressedBytes);
            }
            ptr += 46 + nameLen + extraLen + commentLen;
        }
        return entries;
    },

    findEocdOffset(view) {
        const min = Math.max(0, view.byteLength - 0xffff - 22);
        for (let i = view.byteLength - 22; i >= min; i--) {
            if (view.getUint32(i, true) === 0x06054b50) return i;
        }
        return -1;
    },

    async inflateRaw(compressedBytes) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('DecompressionStream is not available');
        }
        const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const out = await new Response(stream).arrayBuffer();
        return new Uint8Array(out);
    },

    decodeUtf8(bytes) {
        if (!bytes) return '';
        try {
            return new TextDecoder('utf-8').decode(bytes);
        } catch (_) {
            return '';
        }
    },

    bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    },

    bytesToDataUrl(bytes, mimeType) {
        return `data:${mimeType};base64,${LuminaFileProcessor.bytesToBase64(bytes)}`;
    },

    textToDataUrl(text, mimeType) {
        const bytes = new TextEncoder().encode(text || '');
        return LuminaFileProcessor.bytesToDataUrl(bytes, mimeType || 'text/plain');
    },

    mimeFromExtension(path) {
        const ext = (String(path || '').split('.').pop() || '').toLowerCase();
        const map = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            bmp: 'image/bmp',
            tif: 'image/tiff',
            tiff: 'image/tiff',
            heic: 'image/heic',
            heif: 'image/heif'
        };
        return map[ext] || '';
    }
};
