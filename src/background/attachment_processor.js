import { MIME_ALIASES, SUPPORTED_MIME_TYPES } from '../utils/constants.js';
import { NexusAttachmentDB } from '../db/attachment_db.js';

export function detectMediaType(item) {
    if (!item) return null;
    if (typeof item === 'string') {
        const v = item.toLowerCase();
        if (v.startsWith('data:video/')) return 'video';
        if (v.startsWith('data:application/pdf')) return 'pdf';
        if (v.startsWith('data:image/')) return 'image';
        if (/\.(mp4|mov|webm|mkv)(\?|$)/i.test(v)) return 'video';
        if (/\.pdf(\?|$)/i.test(v)) return 'pdf';
        return 'image';
    }
    if (typeof item === 'object') {
        const mimeType = (item.mimeType || '').toLowerCase();
        const dataUrl = (item.dataUrl || '').toLowerCase();
        const previewUrl = (item.previewUrl || '').toLowerCase();
        if (mimeType.startsWith('video/') || dataUrl.startsWith('data:video/')) return 'video';
        if (mimeType === 'application/pdf' || dataUrl.startsWith('data:application/pdf')) return 'pdf';
        if (mimeType.startsWith('image/') || dataUrl.startsWith('data:image/')) return 'image';
        if (/\.(mp4|mov|webm|mkv)(\?|$)/i.test(dataUrl) || /\.(mp4|mov|webm|mkv)(\?|$)/i.test(previewUrl)) return 'video';
        if (/\.pdf(\?|$)/i.test(dataUrl) || /\.pdf(\?|$)/i.test(previewUrl)) return 'pdf';
        return 'image';
    }
    return null;
}

export function bufferToBase64(uint8Array) {
    let binary = '';
    const len = uint8Array.byteLength;
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
        const slice = uint8Array.subarray(i, i + chunk);
        binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
}

export async function readOpfsFileAsBase64(fileUri, fileName) {
    try {
        const urlParts = fileUri.replace('local-db://', '').split('/');
        if (urlParts.length >= 3) {
            const sessionId = urlParts[0];
            const attachmentId = urlParts[1];
            const name = urlParts.slice(2).join('/');
            const key = `${sessionId}_${attachmentId}_${name}`;
            const blob = await NexusAttachmentDB.get(key);
            if (blob) {
                const dataUrl = await NexusAttachmentDB.blobToDataURL(blob);
                if (dataUrl) {
                    return dataUrl.split(',')[1];
                }
            }
        }
    } catch (e) {
        console.error(`[Nexus DB Read] Failed to read ${fileName}:`, e);
    }
    return null;
}

export function normalizeMimeType(mimeType) {
    const mt = String(mimeType || '').toLowerCase().trim();
    return MIME_ALIASES[mt] || mt;
}

export function isSupportedAttachmentMime(mimeType) {
    const mt = normalizeMimeType(mimeType);
    return !!mt && SUPPORTED_MIME_TYPES.has(mt);
}

export function isTextAttachmentMime(mimeType) {
    const mt = normalizeMimeType(mimeType);
    return mt.startsWith('text/') || mt === 'application/json' || mt === 'application/xml';
}

export function getBase64FromAttachment(item) {
    if (!item || typeof item !== 'object') return '';
    if (item.data) return item.data;
    if (item.dataUrl) {
        const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
        if (matches) return matches[2];
    }
    return '';
}

export function decodeBase64Utf8(base64) {
    if (!base64) return '';
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    } catch (_) { return ''; }
}

export function filterParentAttachments(attachments) {
    if (!attachments || !Array.isArray(attachments)) return [];
    const parentIds = new Set();
    for (const item of attachments) {
        if (item && typeof item === 'object' && item.parentAttachmentId) {
            parentIds.add(item.parentAttachmentId);
        }
    }
    return attachments.filter(item => {
        if (item && typeof item === 'object' && item.attachmentId && parentIds.has(item.attachmentId)) {
            return false;
        }
        return true;
    });
}

export async function processAttachments(attachments) {
    const parts = [];
    const unsupported = [];
    if (!attachments || !Array.isArray(attachments)) return { parts, unsupported };
    const filteredAttachments = filterParentAttachments(attachments);
    for (const item of filteredAttachments) {
        if (typeof item === 'string') {
            if (item.startsWith('data:text/')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                const decoded = matches ? decodeBase64Utf8(matches[2]) : '';
                if (decoded) parts.push({ type: "text", text: `[Attached text file]\n${decoded}` });
            } else if (item.startsWith('data:')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                if (matches) {
                    const mime = normalizeMimeType(matches[1]);
                    if (mime.startsWith('image/')) {
                        parts.push({ type: "image_url", image_url: { url: item, detail: "auto" } });
                    } else {
                        unsupported.push({ name: 'Attached file', mimeType: mime });
                    }
                }
            } else {
                parts.push({ type: "image_url", image_url: { url: item, detail: "auto" } });
            }
        } else if (typeof item === 'object') {
            const mimeType = normalizeMimeType(item.mimeType || '');
            const itemName = item.name || 'Unnamed file';
            if (mimeType && !isSupportedAttachmentMime(mimeType)) { unsupported.push({ name: itemName, mimeType }); continue; }
            if (isTextAttachmentMime(mimeType)) {
                const textContent = decodeBase64Utf8(getBase64FromAttachment(item));
                if (textContent) parts.push({ type: "text", text: `[Attached file: ${itemName} (${mimeType})]\n${textContent}` });
                continue;
            }
            if (mimeType.startsWith('audio/')) {
                let base64Data = item.data;
                if (!base64Data && item.fileUri && item.fileUri.startsWith('local-db://')) {
                    base64Data = await readOpfsFileAsBase64(item.fileUri, itemName);
                }
                if (!base64Data && item.dataUrl) {
                    const matches = item.dataUrl.match(/^data:(.+?);base64,(.+)$/);
                    if (matches) base64Data = matches[2];
                }
                if (base64Data) {
                    let format = mimeType.split('/')[1] || 'wav';
                    if (format === 'mpeg') format = 'mp3';
                    parts.push({ type: "input_audio", input_audio: { data: base64Data, format } });
                }
            } else if (mimeType.startsWith('image/')) {
                let url = item.dataUrl || item.previewUrl;
                if (!url && item.fileUri) {
                    if (item.fileUri.startsWith('local-db://')) {
                        const b64Data = await readOpfsFileAsBase64(item.fileUri, itemName);
                        if (b64Data) {
                            url = `data:${mimeType};base64,${b64Data}`;
                        } else if (item.dataUrl && item.dataUrl.startsWith('data:')) {
                            url = item.dataUrl;
                        }
                    } else {
                        url = item.fileUri;
                    }
                }
                if (!url && mimeType && item.data) url = `data:${mimeType};base64,${item.data}`;
                if (url) {
                    parts.push({ type: "image_url", image_url: { url, detail: item.detail || "auto" } });
                } else {
                    unsupported.push({ name: itemName, mimeType });
                }
            } else {
                unsupported.push({ name: itemName, mimeType });
            }
        }
    }
    return { parts, unsupported };
}

export async function processAttachmentsForGemini(attachments) {
    const parts = [];
    const unsupported = [];
    if (!attachments || !Array.isArray(attachments)) return { parts, unsupported };
    const filteredAttachments = filterParentAttachments(attachments);
    for (const item of filteredAttachments) {
        if (typeof item === 'string') {
            if (item.startsWith('data:text/')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                const decoded = matches ? decodeBase64Utf8(matches[2]) : '';
                if (decoded) parts.push({ text: `[Attached text file]\n${decoded}` });
            } else if (item.startsWith('data:')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                if (matches) {
                    const mime = normalizeMimeType(matches[1]);
                    unsupported.push({ name: 'Inline file', mimeType: mime });
                }
            }
        } else if (typeof item === 'object') {
            const mimeType = normalizeMimeType(item.mimeType || '');
            const itemName = item.name || 'Unnamed file';
            if (mimeType && !isSupportedAttachmentMime(mimeType)) { unsupported.push({ name: itemName, mimeType }); continue; }
            if (isTextAttachmentMime(mimeType)) {
                const textContent = decodeBase64Utf8(getBase64FromAttachment(item));
                if (textContent) parts.push({ text: `[Attached file: ${itemName} (${mimeType})]\n${textContent}` });
                continue;
            }
            if (item.fileUri) {
                if (item.fileUri.startsWith('local-db://')) {
                    const b64Data = await readOpfsFileAsBase64(item.fileUri, itemName);
                    if (b64Data) {
                        parts.push({
                            inlineData: {
                                data: b64Data,
                                mimeType: mimeType
                            }
                        });
                    } else if (item.dataUrl && item.dataUrl.startsWith('data:')) {
                        const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
                        if (matches) {
                            parts.push({
                                inlineData: {
                                    data: matches[2],
                                    mimeType: mimeType
                                }
                            });
                        }
                    }
                }
            } else if (item.data) {
                parts.push({
                    inlineData: {
                        data: item.data,
                        mimeType: mimeType
                    }
                });
            } else if (item.dataUrl && item.dataUrl.startsWith('data:')) {
                const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
                if (matches) {
                    parts.push({
                        inlineData: {
                            data: matches[2],
                            mimeType: mimeType
                        }
                    });
                }
            }
        }
    }
    return { parts, unsupported };
}
