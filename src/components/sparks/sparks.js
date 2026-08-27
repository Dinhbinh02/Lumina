import { DEFAULT_SPARKS } from './default_sparks.js';
export const SPARKS_KEY = 'lumina_sparks';
let sidebarSparksExpanded = false;
export { DEFAULT_SPARKS };

async function sparksLoad() {


    const res = await chrome.storage.local.get([SPARKS_KEY]);
    let sparks = res[SPARKS_KEY];
    if (!sparks) {
        sparks = {};
        for (const [id, defSpark] of Object.entries(DEFAULT_SPARKS)) {
            sparks[id] = {
                id: id,
                name: defSpark.name,
                description: defSpark.description || '',
                instructions: defSpark.instructions,
                avatar: null,
                knowledgeFiles: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }
        await sparksSave(sparks);
    }
    return sparks;
}
async function sparksSave(sparks) {
    await chrome.storage.local.set({ [SPARKS_KEY]: sparks });
    if (typeof sidebarSparksRenderList === 'function') {
        sidebarSparksRenderList();
    }
}
async function sparksSaveOrder(orderedIds) {
    const sparks = await sparksLoad();
    orderedIds.forEach((id, index) => {
        if (sparks[id]) {
            sparks[id].order = index;
            sparks[id].updatedAt = Date.now();
        }
    });
    await chrome.storage.local.set({ [SPARKS_KEY]: sparks });
}
async function sparksDelete(id) {
    const sparks = await sparksLoad();
    if (sparks[id]) {
        delete sparks[id];
        await sparksSave(sparks);
    }
}
function sparksNewId() {
    return 'spark_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}
function sparksOpenPage() {
    const chatLayout = document.getElementById('chat-layout');
    const sparksPage = document.getElementById('sparks-page');
    const topbar = document.getElementById('lumina-topbar');
    if (chatLayout && sparksPage) {
        chatLayout.style.display = 'none';
        if (topbar) topbar.style.display = 'none';
        sparksPage.style.display = 'flex';
        sparksRenderList();
        document.getElementById('sidebar-sparks-btn')?.classList.add('active');
        document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
    }
}
function sparksClosePage() {
    const chatLayout = document.getElementById('chat-layout');
    const sparksPage = document.getElementById('sparks-page');
    const topbar = document.getElementById('lumina-topbar');
    if (chatLayout && sparksPage) {
        sparksPage.style.display = 'none';
        if (topbar) topbar.style.display = 'flex';
        chatLayout.style.display = 'flex';
        document.getElementById('sidebar-sparks-btn')?.classList.remove('active');
        document.getElementById('sparks-editor-overlay')?.remove();
    }
}
async function sparksRenderList() {
    const body = document.getElementById('sparks-page-body');
    const sparks = await sparksLoad();
    const list = Object.values(sparks).filter(s => s && !s.isDeleted).sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 99999;
        const orderB = b.order !== undefined ? b.order : 99999;
        if (orderA !== orderB) return orderA - orderB;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
    if (list.length === 0) {
        body.innerHTML = `
            <div class="sparks-empty">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="4" y="6" width="6" height="4" rx="2"/>
                    <rect x="14" y="6" width="6" height="8" rx="3"/>
                    <rect x="4" y="14" width="6" height="6" rx="3"/>
                    <rect x="14" y="18" width="6" height="4" rx="2"/>
                </svg>
                <p>No sparks yet</p>
                <span>Create a custom AI with a name, instructions, and knowledge files.</span>
            </div>`;
        return;
    }
    body.innerHTML = list.map(spark => {
        const avatarHTML = spark.avatar
            ? `<img src="${spark.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
            : (spark.name || '?')[0].toUpperCase();
        const bgStyle = spark.avatar ? 'background-color: transparent;' : '';
        return `
            <div class="spark-card" data-spark-id="${spark.id}">
                <div class="spark-card__avatar" style="${bgStyle}">${avatarHTML}</div>
                <div class="spark-card__info">
                    <div class="spark-card__name">${escapeHtml(spark.name || 'Untitled Spark')}</div>
                    <div class="spark-card__preview">${escapeHtml((spark.instructions || '').slice(0, 80))}${(spark.instructions || '').length > 80 ? '…' : ''}</div>
                </div>
                <div class="spark-card__actions">
                    <button class="spark-card__btn spark-edit-btn" title="Edit" data-spark-id="${spark.id}">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="spark-card__btn spark-delete-btn" title="Delete" data-spark-id="${spark.id}">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    body.querySelectorAll('.spark-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            sparksOpenEditor(btn.dataset.sparkId);
        });
    });
    body.querySelectorAll('.spark-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete this spark?')) {
                await sparksDelete(btn.dataset.sparkId);
                sparksRenderList();
            }
        });
    });
    body.querySelectorAll('.spark-card').forEach(card => {
        card.addEventListener('click', () => {
            sparksOpenEditor(card.dataset.sparkId);
        });
    });
}
async function sparksOpenEditor(sparkId = null) {
    const sparks = await sparksLoad();
    const spark = sparkId ? (sparks[sparkId] || null) : null;
    document.getElementById('sparks-editor-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'sparks-editor-overlay';
    overlay.className = 'sparks-editor-overlay';
    const knowledgeFiles = spark?.knowledgeFiles || [];
    const color = getSparkColor(spark?.name || 'New Spark');
    const welcomeAvatarHTML = spark?.avatar
        ? `<img src="${spark.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
        : (spark?.name || '?')[0].toUpperCase();
    const welcomeBgStyle = spark?.avatar ? 'background-color: transparent;' : `background-color: ${color}`;
    overlay.innerHTML = `
        <div class="sparks-editor">
            <div class="sparks-editor-form">
                <div class="sparks-editor-topbar">
                    <button class="sparks-editor-back" id="sparks-editor-back">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                    </button>
                    <div class="sparks-editor-title-row">
                        <span>${spark ? escapeHtml(spark.name || 'Untitled Spark') : 'New Spark'}</span>
                    </div>
                    <button class="sparks-editor-save" id="sparks-editor-save">Save</button>
                </div>
                <div class="sparks-editor-fields">
                    <div class="spark-avatar-editor">
                        <div class="spark-avatar-preview" id="spark-avatar-preview">
                            ${spark?.avatar ? `<img src="${spark.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : `<span class="spark-avatar-letter">${(spark?.name || '?')[0].toUpperCase()}</span>`}
                            <div class="spark-avatar-overlay">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            </div>
                        </div>
                        <input type="file" id="spark-avatar-file" accept="image/*" style="display:none">
                    </div>
                    <div class="sparks-field">
                        <label class="sparks-label">Name</label>
                        <input type="text" id="spark-name-input" class="sparks-input" placeholder="Give your Spark a name" value="${escapeHtml(spark?.name || '')}" maxlength="60">
                    </div>
                    <div class="sparks-field">
                        <label class="sparks-label">Description</label>
                        <input type="text" id="spark-description-input" class="sparks-input" placeholder="A short description of what this Spark does" value="${escapeHtml(spark?.description || '')}" maxlength="160">
                    </div>
                    <div class="sparks-field">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <label class="sparks-label">Instructions</label>
                            ${sparkId && DEFAULT_SPARKS[sparkId] ? `<button type="button" id="spark-reset-default-btn" class="sparks-reset-btn" style="background: none; border: none; color: var(--lumina-sidebar-text-muted, #8e8e93); font-size: 0.82em; cursor: pointer; text-decoration: underline; padding: 0;">Reset to default</button>` : ''}
                        </div>
                        <div class="lumina-input-container sparks-instructions-container">
                            <div class="lumina-input-bar">
                                <textarea id="spark-instructions-input" class="lumina-chat-input sparks-instructions-input" placeholder="Example: You are a helpful writing tutor. Help users improve their writing with concise, constructive feedback. Be encouraging and specific.">${escapeHtml(spark?.instructions || '')}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="sparks-field">
                        <label class="sparks-label">
                            Knowledge
                            <span class="sparks-label-hint">— add files for your Spark to reference</span>
                        </label>
                        <div class="sparks-knowledge-area" id="sparks-knowledge-area">
                            <div class="sparks-knowledge-files" id="sparks-knowledge-files">
                                ${knowledgeFiles.map((f, i) => `
                                    <div class="sparks-file-chip" data-file-index="${i}">
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                        <span>${escapeHtml(f.name)}</span>
                                        <button class="sparks-file-remove" data-file-index="${i}">×</button>
                                    </div>
                                `).join('')}
                            </div>
                            <button class="sparks-add-file-btn" id="sparks-add-file-btn">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Add files
                            </button>
                            <input type="file" id="sparks-file-input" multiple accept="*/*" style="display:none">
                        </div>
                    </div>
                </div>
            </div>
            <div class="sparks-editor-preview">
                <div class="sparks-editor-resizer" id="sparks-editor-resizer">
                    <div class="sparks-editor-resizer-handle"></div>
                </div>
                <div class="sparks-preview-header">
                    <div class="lumina-model-selector" id="sparks-preview-model-selector">
                        <button class="lumina-model-btn" id="sparks-preview-model-btn">
                            <span class="lumina-current-model" id="sparks-preview-model-label">Loading...</span>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M6 9l6 6 6-6"/>
                            </svg>
                        </button>
                        <div class="lumina-model-dropdown" id="sparks-preview-model-dropdown"></div>
                    </div>
                </div>
                <div class="sparks-preview-chat" id="sparks-preview-chat">
                    <div class="sparks-preview-empty" id="sparks-preview-empty">
                        <div class="spark-welcome">
                            <div class="spark-welcome__avatar" id="sparks-preview-welcome-avatar" style="${welcomeBgStyle}">${welcomeAvatarHTML}</div>
                            <h1 class="spark-welcome__title" id="sparks-preview-welcome-title">${escapeHtml(spark?.name || 'New Spark')}</h1>
                            <p class="spark-welcome__description" id="sparks-preview-welcome-description" style="color: var(--lumina-sidebar-text-muted); font-size: 0.96em; text-align: center; margin: -10px auto 25px auto; max-width: 480px; line-height: 1.45; display: ${spark?.description ? 'block' : 'none'};">${escapeHtml(spark?.description || '')}</p>
                        </div>
                    </div>
                    <div class="lumina-chat-history sparks-preview-messages" id="sparks-preview-messages"></div>
                </div>
                <div class="lumina-chat-input-wrapper sparks-preview-input-area">
                    <div class="lumina-input-container">
                        <div class="lumina-input-bar">
                            <div class="lumina-left-actions">
                                 <button class="lumina-upload-btn" id="sparks-preview-upload" title="Upload File" disabled style="cursor: not-allowed; opacity: 0.5;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                 </button>
                            </div>
                            <textarea class="lumina-chat-input sparks-preview-input" id="sparks-preview-input" placeholder="Test your Spark…" rows="1" disabled></textarea>
                            <div class="lumina-trailing-group">
                                <button class="lumina-mic-btn" id="sparks-preview-mic" title="Voice Input" disabled style="cursor: not-allowed; opacity: 0.5;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="4" width="6" height="10" rx="3"></rect><path d="M5 12a7 7 0 0 0 14 0"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                                </button>
                                <button class="lumina-action-btn sparks-preview-send" id="sparks-preview-send" disabled title="Send Message">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    const mainContent = document.querySelector('.lumina-main-content');
    if (mainContent) {
        mainContent.appendChild(overlay);
    } else {
        document.body.appendChild(overlay);
    }
    const sparksResizer = overlay.querySelector('#sparks-editor-resizer');
    const formPane = overlay.querySelector('.sparks-editor-form');
    const previewPane = overlay.querySelector('.sparks-editor-preview');
    const editorContainer = overlay.querySelector('.sparks-editor');
    if (sparksResizer && formPane && previewPane && editorContainer) {
        let isDragging = false;
        let animationFrameId = null;
        sparksResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            sparksResizer.classList.add('dragging');
            editorContainer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            animationFrameId = requestAnimationFrame(() => {
                const containerRect = editorContainer.getBoundingClientRect();
                const paddingLeft = parseFloat(window.getComputedStyle(editorContainer).paddingLeft) || 0;
                const paddingRight = parseFloat(window.getComputedStyle(editorContainer).paddingRight) || 0;
                const relativeX = e.clientX - containerRect.left - paddingLeft;
                const availableWidth = containerRect.width - paddingLeft - paddingRight - sparksResizer.offsetWidth;
                if (availableWidth <= 0) return;
                let percentage = (relativeX / availableWidth) * 100;
                if (percentage < 25) percentage = 25;
                if (percentage > 75) percentage = 75;
                if (percentage >= 47.5 && percentage <= 52.5) {
                    percentage = 50;
                }
                formPane.style.flex = `${percentage}`;
                previewPane.style.flex = `${100 - percentage}`;
            });
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                sparksResizer.classList.remove('dragging');
                editorContainer.classList.remove('dragging');
                document.body.style.cursor = '';
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
            }
        });
    }
    let currentFiles = [...knowledgeFiles];
    let currentAvatar = spark?.avatar || null;
    let previewHistory = [];
    let previewStreaming = false;
    const initialName = spark?.name || '';
    const initialDescription = spark?.description || '';
    const initialInstructions = spark?.instructions || '';
    const initialAvatar = spark?.avatar || null;
    const getFilesSig = (files) => JSON.stringify((files || []).map(f => ({ name: f.name, size: f.size })));
    const initialFilesSig = getFilesSig(spark?.knowledgeFiles || []);
    const saveBtn = overlay.querySelector('#sparks-editor-save');
    const nameInput = overlay.querySelector('#spark-name-input');
    const descriptionInput = overlay.querySelector('#spark-description-input');
    const instructionsInput = overlay.querySelector('#spark-instructions-input');
    const updateSaveButtonState = () => {
        if (!saveBtn) return;
        const currentName = nameInput ? nameInput.value.trim() : '';
        const currentDesc = descriptionInput ? descriptionInput.value.trim() : '';
        const currentInst = instructionsInput ? instructionsInput.value : '';
        const currentFilesSig = getFilesSig(currentFiles);
        const hasName = currentName.length > 0;
        const isNameChanged = currentName !== initialName.trim();
        const isDescChanged = currentDesc !== initialDescription.trim();
        const isInstChanged = currentInst !== initialInstructions;
        const isAvatarChanged = currentAvatar !== initialAvatar;
        const isFilesChanged = currentFilesSig !== initialFilesSig;
        const hasChanges = isNameChanged || isDescChanged || isInstChanged || isAvatarChanged || isFilesChanged;
        saveBtn.disabled = !(hasName && hasChanges);
    };
    const avatarPreview = overlay.querySelector('#spark-avatar-preview');
    const avatarInput = overlay.querySelector('#spark-avatar-file');
    avatarPreview.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', () => {
        const file = avatarInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                openAvatarCropper(e.target.result, (croppedDataUrl) => {
                    currentAvatar = croppedDataUrl;
                    avatarPreview.innerHTML = `<img src="${currentAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" /><div class="spark-avatar-overlay"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;
                    const welcomeAvatar = overlay.querySelector('#sparks-preview-welcome-avatar');
                    if (welcomeAvatar) {
                        welcomeAvatar.style.backgroundColor = 'transparent';
                        welcomeAvatar.innerHTML = `<img src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
                    }
                    updateSaveButtonState();
                });
            };
            reader.readAsDataURL(file);
        }
    });
    overlay.querySelector('#sparks-editor-back').addEventListener('click', () => {
        overlay.remove();
    });
    const titleLabel = overlay.querySelector('.sparks-editor-title-row span');
    const previewEmpty = overlay.querySelector('#sparks-preview-empty');
    const previewInput = overlay.querySelector('#sparks-preview-input');
    const previewSend = overlay.querySelector('#sparks-preview-send');
    const updatePreviewState = () => {
        const hasName = nameInput.value.trim().length > 0;
        previewInput.disabled = !hasName;
        previewSend.disabled = !hasName;
        const uploadBtn = overlay.querySelector('#sparks-preview-upload');
        const micBtn = overlay.querySelector('#sparks-preview-mic');
        if (uploadBtn) {
            uploadBtn.disabled = !hasName;
            uploadBtn.style.opacity = hasName ? '1' : '0.5';
            uploadBtn.style.cursor = hasName ? 'pointer' : 'not-allowed';
        }
        if (micBtn) {
            micBtn.disabled = !hasName;
            micBtn.style.opacity = hasName ? '0.6' : '0.5';
            micBtn.style.cursor = hasName ? 'pointer' : 'not-allowed';
        }
        if (previewHistory.length > 0) {
            previewEmpty.style.display = 'none';
        } else {
            previewEmpty.style.display = 'flex';
        }
    };
    const welcomeTitle = overlay.querySelector('#sparks-preview-welcome-title');
    const welcomeAvatar = overlay.querySelector('#sparks-preview-welcome-avatar');
    function updateWelcomeAvatarLetter(nameVal) {
        if (welcomeAvatar && !currentAvatar) {
            const firstLetter = (nameVal || '?')[0].toUpperCase();
            welcomeAvatar.textContent = firstLetter;
            const dynamicColor = getSparkColor(nameVal || 'New Spark');
            welcomeAvatar.style.backgroundColor = dynamicColor;
        }
    }
    nameInput.addEventListener('input', () => {
        const nameVal = nameInput.value.trim();
        titleLabel.textContent = nameVal || 'New Spark';
        if (welcomeTitle) {
            welcomeTitle.textContent = nameVal || 'New Spark';
        }
        updateWelcomeAvatarLetter(nameVal);
        updatePreviewState();
        updateSaveButtonState();
    });
    const welcomeDesc = overlay.querySelector('#sparks-preview-welcome-description');
    if (descriptionInput && welcomeDesc) {
        descriptionInput.addEventListener('input', () => {
            const descVal = descriptionInput.value.trim();
            welcomeDesc.textContent = descVal;
            welcomeDesc.style.display = descVal ? 'block' : 'none';
            updateSaveButtonState();
        });
    }
    if (instructionsInput) {
        instructionsInput.addEventListener('input', () => {
            updateSaveButtonState();
        });
    }
    updatePreviewState();
    updateSaveButtonState();
    const fileInput = overlay.querySelector('#sparks-file-input');
    overlay.querySelector('#sparks-add-file-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        for (const file of fileInput.files) {
            const reader = new FileReader();
            await new Promise(resolve => {
                reader.onload = (e) => {
                    currentFiles.push({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        content: e.target.result
                    });
                    resolve();
                };
                if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv|json|js|ts|py|html|css|xml|yaml|yml)$/i)) {
                    reader.readAsText(file);
                } else {
                    reader.readAsDataURL(file);
                }
            });
        }
        fileInput.value = '';
        renderFileChips();
        updateSaveButtonState();
    });
    function renderFileChips() {
        const filesContainer = overlay.querySelector('#sparks-knowledge-files');
        filesContainer.innerHTML = currentFiles.map((f, i) => `
            <div class="sparks-file-chip" data-file-index="${i}">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>${escapeHtml(f.name)}</span>
                <button class="sparks-file-remove" data-file-index="${i}">×</button>
            </div>
        `).join('');
        filesContainer.querySelectorAll('.sparks-file-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.fileIndex);
                currentFiles.splice(idx, 1);
                renderFileChips();
                updateSaveButtonState();
            });
        });
    }
    const resetDefaultBtn = overlay.querySelector('#spark-reset-default-btn');
    if (resetDefaultBtn && sparkId && DEFAULT_SPARKS[sparkId]) {
        resetDefaultBtn.addEventListener('click', () => {
            const def = DEFAULT_SPARKS[sparkId];
            overlay.querySelector('#spark-instructions-input').value = def.instructions;
            if (def.description) {
                overlay.querySelector('#spark-description-input').value = def.description;
            }
            if (def.name) {
                overlay.querySelector('#spark-name-input').value = def.name;
            }
            updateSaveButtonState();
        });
    }
    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            nameInput.classList.add('sparks-input--error');
            setTimeout(() => nameInput.classList.remove('sparks-input--error'), 1500);
            return;
        }
        const sparks = await sparksLoad();
        const isNew = !sparkId || !sparks[sparkId];
        const id = sparkId || sparksNewId();
        const existingSpark = sparks[id];
        if (isNew) {
            Object.values(sparks).forEach(s => {
                if (s.order !== undefined) {
                    s.order += 1;
                }
            });
        }
        sparks[id] = {
            ...existingSpark,
            id,
            name,
            description: overlay.querySelector('#spark-description-input').value.trim(),
            instructions: overlay.querySelector('#spark-instructions-input').value.trim(),
            knowledgeFiles: currentFiles,
            avatar: currentAvatar,
            createdAt: isNew ? Date.now() : (existingSpark?.createdAt || Date.now()),
            updatedAt: Date.now(),
            order: isNew ? 0 : existingSpark?.order
        };
        await sparksSave(sparks);
        overlay.remove();
        sparksRenderList();
    });
    const messagesEl = overlay.querySelector('#sparks-preview-messages');
    function buildSystemPrompt() {
        let sys = overlay.querySelector('#spark-instructions-input').value.trim();
        if (currentFiles.length > 0) {
            const fileContexts = currentFiles
                .filter(f => typeof f.content === 'string' && !f.content.startsWith('data:'))
                .map(f => `--- File: ${f.name} ---\n${f.content}`)
                .join('\n\n');
            if (fileContexts) {
                sys += `\n\n# Knowledge Files\n${fileContexts}`;
            }
        }
        return sys;
    }
    function appendPreviewMessage(role, text) {
        if (role === 'user') {
            const row = document.createElement('div');
            row.className = 'lumina-question-row';
            const qDiv = document.createElement('div');
            qDiv.className = 'lumina-chat-question';
            qDiv.textContent = text;
            row.appendChild(qDiv);
            messagesEl.appendChild(row);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return qDiv;
        } else {
            const aDiv = document.createElement('div');
            aDiv.className = 'lumina-chat-answer';
            aDiv.textContent = text;
            messagesEl.appendChild(aDiv);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return aDiv;
        }
    }
    let sparkSelectedModel = null;
    async function initSparkPreviewModelSelector() {
        const btn = overlay.querySelector('#sparks-preview-model-btn');
        const label = overlay.querySelector('#sparks-preview-model-label');
        const dropdown = overlay.querySelector('#sparks-preview-model-dropdown');
        if (!btn || !dropdown || !label) return;
        const data = await chrome.storage.local.get(['providers', 'advancedParamsByModel', 'lastUsedModel', 'promptSupport']);
        const promptSupport = data.promptSupport || { supported: false, status: 'no', reason: 'Prompt API not checked' };
        const chain = window.LuminaModelHelper ? window.LuminaModelHelper.buildModelChain(data, promptSupport) : [];
        let currentModel = data.lastUsedModel?.model;
        let currentProviderId = data.lastUsedModel?.providerId;
        if (!currentModel && chain.length > 0) {
            currentModel = chain[0].model;
            currentProviderId = chain[0].providerId;
        }
        if (currentModel) {
            sparkSelectedModel = { model: currentModel, providerId: currentProviderId };
            const foundItem = chain.find(c => c.model === currentModel && c.providerId === currentProviderId) || chain.find(c => c.model === currentModel);
            label.textContent = foundItem ? (foundItem.displayName || foundItem.model) : currentModel;
        }
        const renderDropdown = () => {
            dropdown.innerHTML = chain.map(item => {
                const isSelected = sparkSelectedModel && sparkSelectedModel.model === item.model && sparkSelectedModel.providerId === item.providerId;
                return `
                    <div class="lumina-model-item ${isSelected ? 'active' : ''}" data-model="${escapeHtml(item.model)}" data-provider-id="${escapeHtml(item.providerId)}">
                        <div class="lumina-model-item-info">
                            <div class="lumina-model-name">${escapeHtml(item.displayName)}</div>
                            <div class="lumina-model-provider">${escapeHtml(item.providerName || item.providerId)}</div>
                        </div>
                    </div>
                `;
            }).join('');
            dropdown.querySelectorAll('.lumina-model-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const m = el.dataset.model;
                    const p = el.dataset.providerId;
                    sparkSelectedModel = { model: m, providerId: p };
                    const foundItem = chain.find(c => c.model === m && c.providerId === p) || chain.find(c => c.model === m);
                    label.textContent = foundItem ? (foundItem.displayName || foundItem.model) : m;
                    dropdown.classList.remove('active');
                });
            });
        };
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = dropdown.classList.contains('active');
            document.querySelectorAll('.lumina-model-dropdown.active').forEach(d => d.classList.remove('active'));
            if (!isActive) {
                renderDropdown();
                dropdown.classList.add('active');
            }
        });
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    }
    initSparkPreviewModelSelector();
    async function sendPreviewMessage() {
        if (previewStreaming) return;
        const input = overlay.querySelector('#sparks-preview-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.style.height = 'auto';
        appendPreviewMessage('user', text);
        const systemPrompt = buildSystemPrompt();
        const historyForAPI = previewHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
        previewHistory.push({ role: 'user', text });
        updatePreviewState();
        const aiDiv = appendPreviewMessage('assistant', '');
        aiDiv.innerHTML = LuminaTemplates.thinkingDots();
        previewStreaming = true;
        previewSend.disabled = true;
        try {
            let model = sparkSelectedModel?.model;
            let providerId = sparkSelectedModel?.providerId;
            if (!model || !providerId) {
                const storageData = await chrome.storage.local.get(['lastUsedModel', 'providers']);
                if (storageData?.lastUsedModel?.model && storageData?.lastUsedModel?.providerId) {
                    model = storageData.lastUsedModel.model;
                    providerId = storageData.lastUsedModel.providerId;
                } else if (typeof window.getActiveLuminaTab === 'function' && window.getActiveLuminaTab()?.selectedModel) {
                    const curTab = window.getActiveLuminaTab();
                    model = curTab.selectedModel.model;
                    providerId = curTab.selectedModel.providerId;
                } else if (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined' && tabs[activeTabIndex]?.selectedModel) {
                    model = tabs[activeTabIndex].selectedModel.model;
                    providerId = tabs[activeTabIndex].selectedModel.providerId;
                }
                if (!providerId && storageData?.providers && storageData.providers.length > 0) {
                    const activeProv = storageData.providers.find(p => p.enabled !== false && p.apiKey);
                    if (activeProv) {
                        providerId = activeProv.id;
                        model = activeProv.model || 'gemini-2.0-flash';
                    }
                }
            }
            const messages = [
                ...(systemPrompt ? [{ role: 'user', parts: [{ text: `[System Instructions]\n${systemPrompt}` }] }, { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] }] : []),
                ...historyForAPI,
                { role: 'user', parts: [{ text }] }
            ];
            const response = await chrome.runtime.sendMessage({
                action: 'preview_spark',
                messages,
                model,
                providerId
            });
            let replyText = '';
            if (response?.text) {
                replyText = response.text;
            } else if (response?.error) {
                replyText = `Error: ${response.error}`;
            } else {
                replyText = '(No response)';
            }
            aiDiv.textContent = replyText;
            previewHistory.push({ role: 'assistant', text: replyText });
        } catch (err) {
            aiDiv.textContent = 'Could not get a response. Check your API connection.';
            console.error('[Sparks preview]', err);
        } finally {
            previewStreaming = false;
            if (nameInput.value.trim()) previewSend.disabled = false;
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    previewSend.addEventListener('click', sendPreviewMessage);
    previewInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPreviewMessage();
        }
    });
    previewInput.addEventListener('input', () => {
        previewInput.style.height = 'auto';
        previewInput.style.height = Math.min(previewInput.scrollHeight, 100) + 'px';
    });
}
function getSparkColor(name) {
    const colors = [
        '#4db6ac',
        '#00acc1',
        '#43a047',
        '#ab47bc',
        '#5c6bc0',
        '#ff7043',
        '#ec407a',
        '#26a69a'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}
async function sidebarSparksRenderList() {
    const container = document.getElementById('sidebar-sparks-list');
    if (!container) return;
    const sparks = await sparksLoad();
    const list = Object.values(sparks).filter(s => s && !s.isDeleted).sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 99999;
        const orderB = b.order !== undefined ? b.order : 99999;
        if (orderA !== orderB) return orderA - orderB;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
    let html = '';
    const activeTab = (typeof window.getActiveLuminaTab === 'function')
        ? window.getActiveLuminaTab()
        : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null);
    const maxSparksToShow = 4;
    const hasMoreSparks = list.length > maxSparksToShow;
    const visibleSparks = (hasMoreSparks && !sidebarSparksExpanded) ? list.slice(0, maxSparksToShow) : list;
    visibleSparks.forEach(spark => {
        const color = getSparkColor(spark.name);
        const avatarHTML = spark.avatar
            ? `<img src="${spark.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
            : (spark.name || '?')[0].toUpperCase();
        const bgStyle = spark.avatar ? 'background-color: transparent;' : `background-color: ${color}`;
        html += `
            <div class="sidebar-spark-item" draggable="true" data-spark-id="${spark.id}" title="${escapeHtml(spark.name)}">
                <div class="sidebar-spark-item__avatar" style="${bgStyle}">${avatarHTML}</div>
                <span class="sidebar-spark-item__title">${escapeHtml(spark.name)}</span>
                <button class="sidebar-spark-item__menu-btn" data-spark-id="${spark.id}" title="More options" tabindex="-1">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
            </div>
        `;
    });
    if (hasMoreSparks) {
        if (!sidebarSparksExpanded) {
            html += `
                <div class="sidebar-spark-item sidebar-spark-all-btn" style="cursor: pointer;">
                    <div class="sidebar-spark-item__avatar" style="background-color: transparent; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--lumina-sidebar-text); opacity: 1;">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                    </div>
                    <span class="sidebar-spark-item__title">All sparks</span>
                </div>
            `;
        } else {
            html += `
                <div class="sidebar-spark-item sidebar-spark-all-btn" style="cursor: pointer;">
                    <div class="sidebar-spark-item__avatar" style="background-color: transparent; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--lumina-sidebar-text); opacity: 1;">
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                    </div>
                    <span class="sidebar-spark-item__title">Show less</span>
                </div>
            `;
        }
    }
    container.innerHTML = html;
    let draggedItem = null;
    container.querySelectorAll('.sidebar-spark-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.classList.contains('sidebar-spark-all-btn')) {
                sidebarSparksExpanded = !sidebarSparksExpanded;
                sidebarSparksRenderList();
                return;
            }
            if (e.target.closest('.sidebar-spark-item__menu-btn')) return;
            openSparkChat(item.dataset.sparkId);
            const sidebar = document.getElementById('lumina-sidebar');
            const backdrop = document.querySelector('.sidebar-backdrop');
            if (sidebar) sidebar.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        });
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingEl = container.querySelector('.sidebar-spark-item.dragging');
            if (!draggingEl || draggingEl === item) return;
            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (e.clientY < midpoint) {
                container.insertBefore(draggingEl, item);
            } else {
                container.insertBefore(draggingEl, item.nextSibling);
            }
        });
        item.addEventListener('dragend', async () => {
            item.classList.remove('dragging');
            draggedItem = null;
            const orderedIds = Array.from(container.querySelectorAll('.sidebar-spark-item')).map(el => el.dataset.sparkId);
            await sparksSaveOrder(orderedIds);
            if (typeof sparksRenderList === 'function') {
                sparksRenderList();
            }
        });
    });
    container.querySelectorAll('.sidebar-spark-item__menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showSparkContextMenu(btn, btn.dataset.sparkId);
        });
    });
}
function showSparkContextMenu(btn, sparkId) {
    let ctxMenu = document.getElementById('sidebar-spark-context-menu');
    if (!ctxMenu) {
        ctxMenu = document.createElement('div');
        ctxMenu.id = 'sidebar-spark-context-menu';
        ctxMenu.className = 'sidebar-chat-context-menu';
        ctxMenu.style.display = 'none';
        ctxMenu.innerHTML = `
            <div class="sidebar-ctx-item" data-action="edit">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                <span>Edit</span>
            </div>
            <div class="sidebar-ctx-item sidebar-ctx-item--danger" data-action="delete">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
                <span>Delete</span>
            </div>
        `;
        document.body.appendChild(ctxMenu);
    }
    const rect = btn.getBoundingClientRect();
    ctxMenu.style.display = 'block';
    let top = rect.bottom + 4;
    let left = rect.right - ctxMenu.offsetWidth;
    if (left < 4) left = 4;
    ctxMenu.style.top = top + 'px';
    ctxMenu.style.left = left + 'px';
    const clickHandler = async (e) => {
        const item = e.target.closest('.sidebar-ctx-item');
        if (!item) return;
        const action = item.dataset.action;
        if (action === 'edit') {
            sparksOpenEditor(sparkId);
        } else if (action === 'delete') {
            const confirmed = await window.showCustomPopup({
                title: 'Delete Spark',
                body: 'Are you sure you want to delete this Spark?',
                confirmLabel: 'Delete',
                isDanger: true
            });
            if (confirmed) {
                await sparksDelete(sparkId);
                sidebarSparksRenderList();
                if (typeof sparksRenderList === 'function') sparksRenderList();
            }
        }
        hideMenu();
    };
    const hideMenu = () => {
        ctxMenu.style.display = 'none';
        document.removeEventListener('click', outsideClick);
        ctxMenu.removeEventListener('click', clickHandler);
    };
    const outsideClick = (e) => {
        if (!ctxMenu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            hideMenu();
        }
    };
    ctxMenu.addEventListener('click', clickHandler);
    setTimeout(() => {
        document.addEventListener('click', outsideClick);
    }, 10);
}
async function openSparkChat(sparkId) {
    sparksClosePage();
    document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-spark-item.active').forEach(el => el.classList.remove('active'));
    const activeTab = (typeof window.getActiveLuminaTab === 'function')
        ? window.getActiveLuminaTab()
        : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : (window.LuminaSelectionScope?.getTabs?.()?.[window.LuminaSelectionScope?.getActiveTabIndex?.()] ?? null));
    if (activeTab) {
        activeTab.sparkId = sparkId;
        if (activeTab.chatUIInstance) activeTab.chatUIInstance.sparkId = sparkId;
        const targetChatUI = activeTab ? activeTab.chatUIInstance : null;
        const targetSharedInputUI = (typeof window.getSharedInputUI === 'function')
            ? window.getSharedInputUI()
            : ((typeof sharedInputUI !== 'undefined') ? sharedInputUI : (activeTab?.chatUIInstance?.sharedInputUI || null));
        const settingsRes = await chrome.storage.local.get(['lumina_spark_last_settings']);
        const sparkSettings = (settingsRes.lumina_spark_last_settings || {})[sparkId];
        if (activeTab.selectedModel) {
            if (targetChatUI) {
                targetChatUI.activeTabModel = { ...activeTab.selectedModel };
                targetChatUI.thinkingLevel = activeTab.thinkingLevel || null;
            }
            if (targetSharedInputUI) {
                targetSharedInputUI.activeTabModel = { ...activeTab.selectedModel };
                targetSharedInputUI.thinkingLevel = activeTab.thinkingLevel || null;
                if (typeof targetSharedInputUI.refreshModelSelector === 'function') targetSharedInputUI.refreshModelSelector();
                if (typeof targetSharedInputUI.refreshReasoningSelector === 'function') targetSharedInputUI.refreshReasoningSelector();
            }
        } else if (sparkSettings) {
            activeTab.selectedModel = sparkSettings.selectedModel || null;
            activeTab.thinkingLevel = sparkSettings.thinkingLevel || null;
            if (targetChatUI) {
                targetChatUI.activeTabModel = activeTab.selectedModel ? { ...activeTab.selectedModel } : null;
                targetChatUI.thinkingLevel = activeTab.thinkingLevel || null;
            }
            if (targetSharedInputUI) {
                targetSharedInputUI.activeTabModel = activeTab.selectedModel ? { ...activeTab.selectedModel } : null;
                targetSharedInputUI.thinkingLevel = activeTab.thinkingLevel || null;
                if (typeof targetSharedInputUI.refreshModelSelector === 'function') targetSharedInputUI.refreshModelSelector();
                if (typeof targetSharedInputUI.refreshReasoningSelector === 'function') targetSharedInputUI.refreshReasoningSelector();
            }
        } else {
            activeTab.selectedModel = null;
            activeTab.thinkingLevel = null;
            if (targetChatUI) {
                targetChatUI.activeTabModel = null;
                targetChatUI.thinkingLevel = null;
            }
            if (targetSharedInputUI) {
                targetSharedInputUI.activeTabModel = null;
                targetSharedInputUI.thinkingLevel = null;
                if (typeof targetSharedInputUI.refreshModelSelector === 'function') targetSharedInputUI.refreshModelSelector();
                if (typeof targetSharedInputUI.refreshReasoningSelector === 'function') targetSharedInputUI.refreshReasoningSelector();
            }
        }
        activeTab.title = 'New Tab';
        activeTab.sessionId = null;
        activeTab.rawHistoryHtml = null;
        if (activeTab.historyEl) {
            activeTab.historyEl.removeAttribute('data-session-id');
        }
        activeTab.scrollTop = -1;
        if (typeof updateUrlSessionId === 'function') {
            updateUrlSessionId(null);
        }
        if (targetChatUI) {
            targetChatUI.clearHistory();
            if (targetChatUI.inputEl) {
                targetChatUI.inputEl.value = '';
                targetChatUI.inputEl.style.height = 'auto';
                targetChatUI.inputEl.focus();
            }
        }
        await renderSparkWelcomeScreen(activeTab);
        if (typeof updateWelcomeScreenState === 'function') {
            updateWelcomeScreenState('primary');
        }
        if (typeof renderTabs === 'function') renderTabs();
        if (typeof saveTabsState === 'function') saveTabsState();
        if (window.updateTopbarModelSelector) {
            window.updateTopbarModelSelector();
        }
        if (typeof window.updateInputPlaceholder === 'function') {
            window.updateInputPlaceholder();
        }
    }
}
async function renderSparkWelcomeScreen(activeTab) {
    const historyEl = activeTab.historyEl;
    if (!historyEl) return;
    const sparks = await sparksLoad();
    const spark = sparks[activeTab.sparkId];
    if (!spark) return;
    const sessions = await ChatHistoryManager.getAllHistories();
    const sparkChats = Object.values(sessions)
        .filter(s => s.sparkId === spark.id)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5);
    const color = getSparkColor(spark.name);
    const avatarHTML = spark.avatar
        ? `<img src="${spark.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
        : (spark.name || '?')[0].toUpperCase();
    const bgStyle = spark.avatar ? 'background-color: transparent;' : `background-color: ${color}`;
    let recentHTML = '';
    if (sparkChats.length > 0) {
        recentHTML = `
            <div class="spark-welcome__recent">
                <div class="spark-welcome__recent-title">Recent</div>
                <div class="spark-welcome__recent-list">
                    ${sparkChats.map(s => {
            let displayTitle = s.title;
            if (!s.isRenamed && !s.autoNamed && s.questions && s.questions.length > 0) {
                displayTitle = s.questions[s.questions.length - 1].text || "Untitled Chat";
            }
            if (!displayTitle) displayTitle = "Untitled Chat";
            displayTitle = displayTitle.charAt(0).toUpperCase() + displayTitle.slice(1);
            return `
                            <div class="spark-welcome__recent-item" data-session-id="${s.id}">
                                <div class="spark-welcome__recent-item-avatar" style="${bgStyle}">${avatarHTML}</div>
                                <span class="spark-welcome__recent-item-title">${escapeHtml(displayTitle)}</span>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }
    historyEl.innerHTML = `
        <div class="spark-welcome">
            <div class="spark-welcome__avatar" style="${bgStyle}">${avatarHTML}</div>
            <h1 class="spark-welcome__title">${escapeHtml(spark.name)}</h1>
            ${spark.description ? `<p class="spark-welcome__description" style="color: var(--lumina-sidebar-text-muted); font-size: 0.96em; text-align: center; margin: -10px auto 25px auto; max-width: 480px; line-height: 1.45;">${escapeHtml(spark.description)}</p>` : ''}
            ${recentHTML}
        </div>
    `;
    historyEl.querySelectorAll('.spark-welcome__recent-item').forEach(item => {
        item.addEventListener('click', async () => {
            const sid = item.dataset.sessionId;
            const messages = await ChatHistoryManager.getSessionMessages(sid);
            const meta = sessions[sid] || { id: sid };
            window.loadHistoryIntoNewTab(messages, meta, sid, null, false);
        });
    });
}
function openAvatarCropper(imageSrc, callback) {
    const modal = document.createElement('div');
    modal.className = 'spark-crop-modal';
    modal.innerHTML = `
        <div class="spark-crop-container">
            <div class="spark-crop-title">Adjust Avatar</div>
            <div class="spark-crop-viewport">
                <div class="spark-crop-mask"></div>
                <img id="spark-crop-image" src="${imageSrc}" style="position: absolute; cursor: move; user-select: none; max-width: none !important; max-height: none !important; width: auto; height: auto;" />
            </div>
            <div class="spark-crop-controls">
                <input type="range" id="spark-crop-zoom" min="100" max="300" value="100" style="width: 80%; cursor: pointer;" />
            </div>
            <div class="spark-crop-actions">
                <button class="spark-crop-btn spark-crop-cancel" id="spark-crop-cancel">Cancel</button>
                <button class="spark-crop-btn spark-crop-done" id="spark-crop-done">Apply</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const img = modal.querySelector('#spark-crop-image');
    const zoomInput = modal.querySelector('#spark-crop-zoom');
    const doneBtn = modal.querySelector('#spark-crop-done');
    const cancelBtn = modal.querySelector('#spark-crop-cancel');
    let scale = 1.0;
    let imgWidth = 0;
    let imgHeight = 0;
    let posX = 0;
    let posY = 0;
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    function clampPosition() {
        const viewportSize = 250;
        const currentWidth = imgWidth * scale;
        const currentHeight = imgHeight * scale;
        if (posX > 0) posX = 0;
        if (posX < viewportSize - currentWidth) posX = viewportSize - currentWidth;
        if (posY > 0) posY = 0;
        if (posY < viewportSize - currentHeight) posY = viewportSize - currentHeight;
    }
    img.onload = () => {
        const viewportSize = 250;
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio >= 1) {
            imgHeight = viewportSize;
            imgWidth = viewportSize * ratio;
        } else {
            imgWidth = viewportSize;
            imgHeight = viewportSize / ratio;
        }
        const minScale = Math.max(viewportSize / imgWidth, viewportSize / imgHeight);
        scale = minScale;
        zoomInput.min = Math.round(minScale * 100);
        zoomInput.max = Math.round(minScale * 300);
        zoomInput.value = Math.round(minScale * 100);
        posX = (viewportSize - imgWidth * scale) / 2;
        posY = (viewportSize - imgHeight * scale) / 2;
        clampPosition();
        updateTransform();
    };
    if (img.complete) {
        img.onload();
    }
    function updateTransform() {
        img.style.width = `${imgWidth * scale}px`;
        img.style.height = `${imgHeight * scale}px`;
        img.style.left = `${posX}px`;
        img.style.top = `${posY}px`;
    }
    function performZoom(factor, clientX, clientY) {
        const prevScale = scale;
        const minScale = parseFloat(zoomInput.min) / 100;
        const maxScale = parseFloat(zoomInput.max) / 100;
        let newScale = scale * factor;
        if (newScale < minScale) newScale = minScale;
        if (newScale > maxScale) newScale = maxScale;
        if (newScale === prevScale) return;
        scale = newScale;
        zoomInput.value = Math.round(scale * 100);
        const viewport = modal.querySelector('.spark-crop-viewport');
        const rect = viewport.getBoundingClientRect();
        const zoomX = (clientX !== undefined) ? (clientX - rect.left) : 125;
        const zoomY = (clientY !== undefined) ? (clientY - rect.top) : 125;
        posX = zoomX - (zoomX - posX) * (scale / prevScale);
        posY = zoomY - (zoomY - posY) * (scale / prevScale);
        clampPosition();
        updateTransform();
    }
    zoomInput.addEventListener('input', () => {
        const targetScale = parseInt(zoomInput.value) / 100;
        const factor = targetScale / scale;
        performZoom(factor);
    });
    const viewport = modal.querySelector('.spark-crop-viewport');
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        let delta = e.deltaY;
        let sensitivity = 0.0015;
        if (e.ctrlKey) {
            sensitivity = 0.003;
        }
        delta = Math.max(-100, Math.min(100, delta));
        const factor = Math.exp(-delta * sensitivity);
        performZoom(factor, e.clientX, e.clientY);
    }, { passive: false });
    img.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX - posX;
        startY = e.clientY - posY;
        isDragging = true;
    });
    const moveHandler = (e) => {
        if (!isDragging) return;
        posX = e.clientX - startX;
        posY = e.clientY - startY;
        clampPosition();
        updateTransform();
    };
    const upHandler = () => {
        isDragging = false;
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
    cancelBtn.addEventListener('click', () => {
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
        modal.remove();
    });
    doneBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 150;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        const drawScale = 150 / 250;
        ctx.drawImage(img, posX * drawScale, posY * drawScale, imgWidth * scale * drawScale, imgHeight * scale * drawScale);
        const dataUrl = canvas.toDataURL('image/png');
        callback(dataUrl);
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
        modal.remove();
    });
}
function initSparks() {
    const sparksBtn = document.getElementById('sidebar-sparks-btn');
    if (sparksBtn) {
        sparksBtn.removeAttribute('disabled');
        sparksBtn.classList.remove('disabled');
        sparksBtn.title = 'My Sparks';
        sparksBtn.addEventListener('click', () => {
            const page = document.getElementById('sparks-page');
            if (page && page.style.display !== 'none') {
                sparksClosePage();
            } else {
                sparksOpenPage();
            }
        });
    }
    const newSparkBtn = document.getElementById('sparks-new-btn');
    if (newSparkBtn) {
        newSparkBtn.addEventListener('click', () => sparksOpenEditor(null));
    }
    const sidebarNewSparkBtn = document.getElementById('sidebar-new-spark-btn');
    if (sidebarNewSparkBtn) {
        sidebarNewSparkBtn.addEventListener('click', () => sparksOpenEditor(null));
    }
    document.getElementById('sidebar-new-chat-btn')?.addEventListener('click', () => {
        const activeTab = (typeof window.getActiveLuminaTab === 'function')
            ? window.getActiveLuminaTab()
            : ((typeof window.getActiveSpotlightTab === 'function') ? window.getActiveSpotlightTab() : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null));
        if (activeTab) {
            activeTab.sparkId = null;
            if (typeof renderTabs === 'function') renderTabs();
            if (typeof saveTabsState === 'function') saveTabsState();
        }
        sparksClosePage();
        sidebarSparksRenderList();
    });
    document.getElementById('topbar-new-chat-btn')?.addEventListener('click', () => {
        const activeTab = (typeof window.getActiveLuminaTab === 'function')
            ? window.getActiveLuminaTab()
            : ((typeof window.getActiveSpotlightTab === 'function') ? window.getActiveSpotlightTab() : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null));
        if (activeTab) {
            activeTab.sparkId = null;
            if (typeof renderTabs === 'function') renderTabs();
            if (typeof saveTabsState === 'function') saveTabsState();
        }
        sparksClosePage();
        sidebarSparksRenderList();
    });
    document.addEventListener('click', (e) => {
        const chatItem = e.target.closest('.recent-chat-item');
        if (chatItem && !e.target.closest('.recent-chat-item__menu-btn')) {
            sparksClosePage();
            sidebarSparksRenderList();
        }
    });
    sidebarSparksRenderList();
    if (typeof tabs !== 'undefined') {
        tabs.forEach(tab => {
            if (tab && tab.sparkId && !tab.sessionId) {
                renderSparkWelcomeScreen(tab);
                if (typeof updateWelcomeScreenState === 'function') {
                    updateWelcomeScreenState('primary');
                }
            }
        });
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSparks);
} else {
    initSparks();
}