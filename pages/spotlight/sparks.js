/**
 * Lumina Sparks — Custom AI personalities
 * Manages: list panel, editor (name/instructions/knowledge), live preview chat
 */

const SPARKS_KEY = 'lumina_sparks';

// ─── Storage helpers ─────────────────────────────────────────────────────────

const DEFAULT_SPARKS = {
    'spark_ielts_writing_task1': {
        name: 'IELTS Writing Task 1 Tutor',
        instructions: 'You are an expert, objective and professional IELTS Writing Task 1 Examiner. Your goal is to provide an accurate, highly detailed, and rigorous evaluation of the user\'s response according to official IELTS assessment criteria. While you should be thorough in identifying mistakes and suggesting improvements, you must calibrate your scores accurately to the official IELTS descriptors—if an essay is of exceptional quality, contains advanced vocabulary, complex structures, and meets all task criteria perfectly (especially if it is a refined/model response), you should award it the high band score it deserves (8.5 or 9.0) instead of being overly strict and capping it lower.\n\nFor each of the 4 official criteria, provide:\n1. Detailed Score Breakdown & Rationale.\n2. Specific mistakes or areas of weakness in their text with line-by-line quotes and exact corrections.\n3. Advanced lexical/grammatical alternatives.\n\nTask Achievement (TA):\n- Check if there is a clear Overview.\n- Check if all key features/trends/comparisons are reported with accurate figures.\n- Check if they avoided drawing conclusions or personal opinions.\n\nCoherence & Cohesion (CC):\n- Evaluate paragraph structure (Introduction, Overview, Details).\n- Check the range, accuracy, and naturalness of cohesive devices and linkers (avoid overusing them).\n- Check referential clarity (use of pronouns, the former/the latter).\n\nLexical Resource (LR):\n- Point out repetitive vocabulary, basic verbs, or inappropriate collocations.\n- Suggest academic/advanced vocabulary suited for reporting data (e.g., fluctuation, plateau, double, threefold, plummet).\n\nGrammatical Range & Accuracy (GRA):\n- Identify grammatical errors (tenses, prepositions, articles, subject-verb agreement, punctuation).\n- Suggest complex/compound sentence structures to vary sentence variety.\n\nStructure your response as follows:\n- Overall Band Score Estimate: (e.g., 6.5 - provide a precise estimate)\n- Inline Essay Correction (Sửa bài trực tiếp trên bài gốc):\n  Show the entire student\'s response. Correct all errors inline by crossing out the mistakes using ~~wrong text~~ and adding the correction right next to it in bold square brackets **[corrected text]** (e.g., ~~in 2002~~ **[in 2002,]** or ~~was decreased~~ **[decreased]**). This makes it visual and easy to see every mistake.\n- Deep Error Breakdown & Explanations (Giải thích chi tiết các lỗi sai):\n  Analyze every single error identified in the inline correction section in detail. Explain the grammatical, lexical, or stylistic reasons for the correction. Teach advanced sentence structures, transition words, and academic vocabulary related to the essay\'s context to help the user score higher next time.\n- Detailed Evaluation by Criterion:\n  - Task Achievement: [Very detailed analysis, list of strengths and specific weaknesses with quotes]\n  - Coherence & Cohesion: [Detailed paragraphing and linkers analysis]\n  - Lexical Resource: [Vocabulary range, exact word choice corrections, list of suggestions]\n  - Grammatical Range & Accuracy: [Detailed grammar corrections with exact line quotes and rewritten fixes]\n- Sentence-by-Sentence Correction/Refinement Table: A markdown table containing:\n  | Original Sentence | Error/Weakness/Refinement Needs | Corrected & Upgraded Version |\n  (Note: Only include sentences that have actual errors, weaknesses, or clear opportunities for stylistic upgrade. For essays that are exceptionally written or already at Band 9.0 level, do not manufacture minor nitpicks or force entries if they are already natural and correct—simply note "No major corrections required" or list only genuine high-level refinements.)\n- Alternative Expressions / Rewritten Version: Provide a model band-9 level response based on their input. If the original essay is already at Band 9.0 level, do not copy it verbatim; instead, rewrite it using alternative advanced structures and vocabulary to show the user different ways to express the same data and relationships.\n- Key Actionable Tips: 3-5 concrete actionable points for improvement.\n\nKeep your tone professional, encouraging, and highly educational. If the user didn\'t provide the prompt or image details, ask them to describe the graph/chart or paste the prompt.'
    },
    'spark_ielts_writing_task2': {
        name: 'IELTS Writing Task 2 Tutor',
        instructions: 'You are an expert, objective and professional IELTS Writing Task 2 Examiner. Your goal is to provide an accurate, highly detailed, and rigorous evaluation of the user\'s essay according to official IELTS assessment criteria. While you should be thorough in identifying mistakes and suggesting improvements, you must calibrate your scores accurately to the official IELTS descriptors—if an essay is of exceptional quality, contains advanced vocabulary, complex structures, and meets all task criteria perfectly (especially if it is a refined/model response), you should award it the high band score it deserves (8.5 or 9.0) instead of being overly strict and capping it lower.\n\nFor each of the 4 official criteria, provide:\n1. Detailed Score Breakdown & Rationale.\n2. Specific mistakes or areas of weakness in their text with line-by-line quotes and exact corrections.\n3. Advanced lexical/grammatical alternatives.\n\nTask Response (TR):\n- Did the user fully address all parts of the prompt? Is there a clear position throughout? Are main ideas supported with relevant explanations and examples?\n- Check if they avoided drawing general conclusions without support.\n\nCoherence & Cohesion (CC):\n- Is the essay organized logically with clear paragraphing? Is there a central topic in each paragraph? Are linkers and cohesive devices used accurately and without overuse?\n\nLexical Resource (LR):\n- Did the user use a wide range of vocabulary with precision? Is there appropriate use of less common lexical items, collocations, and academic vocabulary? Are spelling/word-formation errors avoided?\n\nGrammatical Range & Accuracy (GRA):\n- Did the user use a variety of complex grammar structures with high accuracy? Are punctuation and sentence structures correct?\n\nStructure your response as follows:\n- Overall Band Score Estimate: (e.g., 7.0 - provide a precise estimate)\n- Inline Essay Correction (Sửa bài trực tiếp trên bài gốc):\n  Show the entire student\'s essay. Correct all errors inline by crossing out the mistakes using ~~wrong text~~ and adding the correction right next to it in bold square brackets **[corrected text]** (e.g., ~~conclude~~ **[to conclude,]** or ~~is depend~~ **[depends]**). This makes it visual and easy to see every mistake.\n- Deep Error Breakdown & Explanations (Giải thích chi tiết các lỗi sai):\n  Analyze every single error identified in the inline correction section in detail. Explain the grammatical, lexical, or stylistic reasons for the correction. Teach advanced sentence structures, transition words, and academic vocabulary related to the essay\'s context to help the user score higher next time.\n- Detailed Evaluation by Criterion:\n  - Task Response: [Very detailed analysis, list of strengths and specific weaknesses with quotes]\n  - Coherence & Cohesion: [Detailed paragraphing and linkers analysis]\n  - Lexical Resource: [Vocabulary range, exact word choice corrections, list of suggestions]\n  - Grammatical Range & Accuracy: [Detailed grammar corrections with exact line quotes and rewritten fixes]\n- Sentence-by-Sentence Correction/Refinement Table: A markdown table containing:\n  | Original Sentence | Error/Weakness/Refinement Needs | Corrected & Upgraded Version |\n  (Note: Only include sentences that have actual errors, weaknesses, or clear opportunities for stylistic upgrade. For essays that are exceptionally written or already at Band 9.0 level, do not manufacture minor nitpicks or force entries if they are already natural and correct—simply note "No major corrections required" or list only genuine high-level refinements.)\n- Alternative Expressions / Rewritten Version: Provide a model band-9 level response based on their input. If the original essay is already at Band 9.0 level, do not copy it verbatim; instead, rewrite it using alternative advanced structures and vocabulary to show the user different ways to express the same ideas and arguments.\n- Key Actionable Tips: 3-5 concrete actionable points for improvement.\n\nKeep your tone professional, encouraging, and highly educational. If the user didn\'t provide the essay prompt, ask them to paste both the prompt and their essay.'
    }
};

async function sparksLoad() {
    const res = await chrome.storage.local.get([SPARKS_KEY]);
    let sparks = res[SPARKS_KEY];
    let needsSave = false;

    if (!sparks) {
        sparks = {};
        needsSave = true;
    }

    for (const [id, defSpark] of Object.entries(DEFAULT_SPARKS)) {
        const existing = sparks[id];
        if (!existing) {
            sparks[id] = {
                id: id,
                name: defSpark.name,
                instructions: defSpark.instructions,
                avatar: null,
                knowledgeFiles: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            needsSave = true;
        }
    }

    if (needsSave) {
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

async function sparksDelete(id) {
    const sparks = await sparksLoad();
    delete sparks[id];
    await sparksSave(sparks);
}

function sparksNewId() {
    return 'spark_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function sparksOpenPage() {
    const chatLayout = document.getElementById('chat-layout');
    const sparksPage = document.getElementById('sparks-page');
    const topbar = document.getElementById('spotlight-topbar');
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
    const topbar = document.getElementById('spotlight-topbar');
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
    if (!body) return;

    const sparks = await sparksLoad();
    const list = Object.values(sparks).sort((a, b) => b.updatedAt - a.updatedAt);

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

// ─── Editor ───────────────────────────────────────────────────────────────────

async function sparksOpenEditor(sparkId = null) {
    const sparks = await sparksLoad();
    const spark = sparkId ? (sparks[sparkId] || null) : null;

    // Remove existing editor if any
    document.getElementById('sparks-editor-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sparks-editor-overlay';
    overlay.className = 'sparks-editor-overlay';

    const knowledgeFiles = spark?.knowledgeFiles || [];

    overlay.innerHTML = `
        <div class="sparks-editor">
            <!-- Left: Form -->
            <div class="sparks-editor__form">
                <div class="sparks-editor__topbar">
                    <button class="sparks-editor__back" id="sparks-editor-back">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                    </button>
                    <div class="sparks-editor__title-row">
                        <div class="sparks-editor__icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
                                <rect x="4" y="6" width="6" height="4" rx="2"/>
                                <rect x="14" y="6" width="6" height="8" rx="3"/>
                                <rect x="4" y="14" width="6" height="6" rx="3"/>
                                <rect x="14" y="18" width="6" height="4" rx="2"/>
                            </svg>
                        </div>
                        <span>${spark ? escapeHtml(spark.name || 'Untitled Spark') : 'New Spark'}</span>
                    </div>
                    <button class="sparks-editor__save" id="sparks-editor-save">Save</button>
                </div>

                <div class="sparks-editor__fields">
                    <div class="spark-avatar-editor">
                        <div class="spark-avatar-preview" id="spark-avatar-preview">
                            ${spark?.avatar ? `<img src="${spark.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : `<span class="spark-avatar-letter">${(spark?.name || '?')[0].toUpperCase()}</span>`}
                            <div class="spark-avatar-overlay">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            </div>
                        </div>
                        <input type="file" id="spark-avatar-file" accept="image/*" style="display: none;">
                    </div>

                    <div class="sparks-field">
                        <label class="sparks-label">Name</label>
                        <input type="text" id="spark-name-input" class="sparks-input" placeholder="Give your Spark a name" value="${escapeHtml(spark?.name || '')}" maxlength="60">
                    </div>

                    <div class="sparks-field">
                        <label class="sparks-label">Instructions</label>
                        <textarea id="spark-instructions-input" class="sparks-textarea" placeholder="Example: You are a helpful writing tutor. Help users improve their writing with concise, constructive feedback. Be encouraging and specific.">${escapeHtml(spark?.instructions || '')}</textarea>
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

            <!-- Right: Preview -->
            <div class="sparks-editor__preview">
                <div class="sparks-preview__header">Preview</div>
                <div class="sparks-preview__chat" id="sparks-preview-chat">
                    <div class="sparks-preview__empty" id="sparks-preview-empty">
                        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="4" y="6" width="6" height="4" rx="2"/>
                            <rect x="14" y="6" width="6" height="8" rx="3"/>
                            <rect x="4" y="14" width="6" height="6" rx="3"/>
                            <rect x="14" y="18" width="6" height="4" rx="2"/>
                        </svg>
                        <p>Enter a name to start testing your Spark</p>
                    </div>
                    <div class="sparks-preview__messages" id="sparks-preview-messages"></div>
                </div>
                <div class="sparks-preview__input-area">
                    <textarea class="sparks-preview__input" id="sparks-preview-input" placeholder="Test your Spark…" rows="1" disabled></textarea>
                    <button class="sparks-preview__send" id="sparks-preview-send" disabled>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
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

    let currentFiles = [...knowledgeFiles];
    let currentAvatar = spark?.avatar || null;
    let previewHistory = [];
    let previewStreaming = false;

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
                });
            };
            reader.readAsDataURL(file);
        }
    });

    // ── Back button ──
    overlay.querySelector('#sparks-editor-back').addEventListener('click', () => {
        overlay.remove();
    });

    // ── Name input → update title + enable preview ──
    const nameInput = overlay.querySelector('#spark-name-input');
    const titleLabel = overlay.querySelector('.sparks-editor__title-row span');
    const previewEmpty = overlay.querySelector('#sparks-preview-empty');
    const previewInput = overlay.querySelector('#sparks-preview-input');
    const previewSend = overlay.querySelector('#sparks-preview-send');

    const updatePreviewState = () => {
        const hasName = nameInput.value.trim().length > 0;
        previewInput.disabled = !hasName;
        previewSend.disabled = !hasName;
        if (hasName) {
            previewEmpty.style.display = 'none';
        } else {
            previewEmpty.style.display = 'flex';
        }
    };

    nameInput.addEventListener('input', () => {
        titleLabel.textContent = nameInput.value.trim() || 'New Spark';
        updatePreviewState();
    });
    updatePreviewState();

    // ── File upload ──
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
                        content: e.target.result  // base64 data URL or text
                    });
                    resolve();
                };
                // Read as text if text-based, otherwise as data URL
                if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv|json|js|ts|py|html|css|xml|yaml|yml)$/i)) {
                    reader.readAsText(file);
                } else {
                    reader.readAsDataURL(file);
                }
            });
        }
        fileInput.value = '';
        renderFileChips();
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
            });
        });
    }

    // ── Save ──
    overlay.querySelector('#sparks-editor-save').addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            nameInput.classList.add('sparks-input--error');
            setTimeout(() => nameInput.classList.remove('sparks-input--error'), 1500);
            return;
        }
        const sparks = await sparksLoad();
        const id = sparkId || sparksNewId();
        sparks[id] = {
            id,
            name,
            instructions: overlay.querySelector('#spark-instructions-input').value.trim(),
            knowledgeFiles: currentFiles,
            avatar: currentAvatar,
            createdAt: sparks[id]?.createdAt || Date.now(),
            updatedAt: Date.now()
        };
        await sparksSave(sparks);
        overlay.remove();
        sparksRenderList();
    });

    // ── Preview Chat ──
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
        const div = document.createElement('div');
        div.className = `sparks-msg sparks-msg--${role}`;
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return div;
    }

    async function sendPreviewMessage() {
        if (previewStreaming) return;
        const input = overlay.querySelector('#sparks-preview-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.style.height = 'auto';

        // Show user message
        appendPreviewMessage('user', text);

        // Build history with system prompt
        const systemPrompt = buildSystemPrompt();
        const historyForAPI = previewHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] }));

        previewHistory.push({ role: 'user', text });

        // AI response placeholder
        const aiDiv = appendPreviewMessage('assistant', '');
        aiDiv.innerHTML = '<span class="sparks-typing-dot"></span><span class="sparks-typing-dot"></span><span class="sparks-typing-dot"></span>';

        previewStreaming = true;
        previewSend.disabled = true;

        try {
            let model = 'gemini-2.0-flash';
            let providerId = 'google';
            if (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined' && tabs[activeTabIndex]?.selectedModel) {
                model = tabs[activeTabIndex].selectedModel.model || model;
                providerId = tabs[activeTabIndex].selectedModel.providerId || providerId;
            } else {
                const storageData = await chrome.storage.local.get(['lastUsedModel']);
                if (storageData?.lastUsedModel) {
                    model = storageData.lastUsedModel.model || model;
                    providerId = storageData.lastUsedModel.providerId || providerId;
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

    // Auto-resize textarea
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
    const list = Object.values(sparks).sort((a, b) => b.updatedAt - a.updatedAt);

    let html = '';
    const activeTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;

    list.forEach(spark => {
        const color = getSparkColor(spark.name);
        const avatarHTML = spark.avatar
            ? `<img src="${spark.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
            : (spark.name || '?')[0].toUpperCase();
        const bgStyle = spark.avatar ? 'background-color: transparent;' : `background-color: ${color}`;
        html += `
            <div class="sidebar-spark-item" data-spark-id="${spark.id}" title="${escapeHtml(spark.name)}">
                <div class="sidebar-spark-item__avatar" style="${bgStyle}">${avatarHTML}</div>
                <span class="sidebar-spark-item__title">${escapeHtml(spark.name)}</span>
                <button class="sidebar-spark-item__menu-btn" data-spark-id="${spark.id}" title="More options" tabindex="-1">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.sidebar-spark-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.sidebar-spark-item__menu-btn')) return;
            openSparkChat(item.dataset.sparkId);
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
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
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

    const activeTab = (typeof window.getActiveSpotlightTab === 'function') ? window.getActiveSpotlightTab() : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null);
    if (activeTab) {
        activeTab.sparkId = sparkId;

        const isSecondary = (typeof isSplitMode !== 'undefined' && isSplitMode && typeof hoveredPane !== 'undefined' && hoveredPane === 'secondary');
        const targetChatUI = activeTab ? activeTab.chatUIInstance : null;
        const targetSharedInputUI = isSecondary ? sharedInputUISecondary : sharedInputUI;

        const settingsRes = await chrome.storage.local.get(['lumina_spark_last_settings']);
        const sparkSettings = (settingsRes.lumina_spark_last_settings || {})[sparkId];
        if (sparkSettings) {
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
            updateWelcomeScreenState(isSecondary ? 'secondary' : 'primary');
        }

        if (typeof renderTabs === 'function') renderTabs();
        if (typeof saveTabsState === 'function') saveTabsState();
        if (isSecondary) {
            if (window.updateTopbarModelSelectorSecondary) {
                window.updateTopbarModelSelectorSecondary();
            }
        } else {
            if (window.updateTopbarModelSelector) {
                window.updateTopbarModelSelector();
            }
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

    const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
    const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
    const sparkChats = Object.values(sessions)
        .filter(s => s.sparkId === spark.id)
        .sort((a, b) => b.updatedAt - a.updatedAt);

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
                        if (!s.isRenamed && s.questions && s.questions.length > 0) {
                            displayTitle = s.questions[s.questions.length - 1].text || "Untitled Chat";
                        }
                        if (!displayTitle) displayTitle = "Untitled Chat";
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
            ${recentHTML}
        </div>
    `;

    historyEl.querySelectorAll('.spark-welcome__recent-item').forEach(item => {
        item.addEventListener('click', async () => {
            const sid = item.dataset.sessionId;
            const contentKey = `lumina_session_${sid}`;
            const contentData = await chrome.storage.local.get([contentKey]);
            const messages = contentData[contentKey] || [];
            const meta = sessions[sid] || { id: sid };
            window.loadHistoryIntoNewTab(messages, meta, sid);
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

    zoomInput.addEventListener('input', () => {
        const prevScale = scale;
        scale = parseInt(zoomInput.value) / 100;
        
        const viewportSize = 250;
        const centerX = viewportSize / 2;
        const centerY = viewportSize / 2;

        posX = centerX - (centerX - posX) * (scale / prevScale);
        posY = centerY - (centerY - posY) * (scale / prevScale);

        clampPosition();
        updateTransform();
    });

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

        ctx.beginPath();
        ctx.arc(75, 75, 75, 0, Math.PI * 2);
        ctx.clip();

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
        const activeTab = (typeof window.getActiveSpotlightTab === 'function') ? window.getActiveSpotlightTab() : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null);
        if (activeTab) {
            activeTab.sparkId = null;
            if (typeof renderTabs === 'function') renderTabs();
            if (typeof saveTabsState === 'function') saveTabsState();
        }
        sparksClosePage();
        sidebarSparksRenderList();
    });
    document.getElementById('topbar-new-chat-btn')?.addEventListener('click', () => {
        const activeTab = (typeof window.getActiveSpotlightTab === 'function') ? window.getActiveSpotlightTab() : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null);
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
            const activeTab = (typeof window.getActiveSpotlightTab === 'function') ? window.getActiveSpotlightTab() : ((typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null);
            if (activeTab) {
                const sparkId = chatItem.dataset.sparkId || null;
                activeTab.sparkId = sparkId;
                if (typeof renderTabs === 'function') renderTabs();
                if (typeof saveTabsState === 'function') saveTabsState();
            }
            sparksClosePage();
            sidebarSparksRenderList();
        }
    });
    sidebarSparksRenderList();

    if (typeof tabs !== 'undefined') {
        tabs.forEach(tab => {
            if (tab && tab.sparkId && !tab.sessionId) {
                renderSparkWelcomeScreen(tab);
                const pane = (typeof secondaryActiveTabIndex !== 'undefined' && tabs[secondaryActiveTabIndex] === tab) ? 'secondary' : 'primary';
                if (typeof updateWelcomeScreenState === 'function') {
                    updateWelcomeScreenState(pane);
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
