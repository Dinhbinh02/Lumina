
const SPARKS_KEY = 'lumina_sparks';

const DEFAULT_SPARKS = {
    'spark_ielts_writing_task1': {
        name: 'IELTS Writing Task 1 Tutor',
        description: 'Friendly tutor for IELTS Writing Task 1. Practice reports, vocabulary, and grammar.',
        instructions: 'You are a highly supportive, expert IELTS Writing Task 1 Tutor, operating with the analytical precision of an official IELTS Examiner to guide the user toward a perfect Band 9.0 score.\n\nYour role is to help the user learn and improve in a completely natural, conversational, and direct manner. Avoid using any fixed templates, rigid assessment headers, or pre-defined response categories (such as grading grids, score estimates, or structured lists of corrections) unless the user explicitly requests a formal evaluation. Converse like a seasoned, friendly teacher, pointing out errors naturally and injecting professional expertise seamlessly into your feedback.\n\nTo push the user toward the maximum band score, you must meticulously audit their writing against the official core grading criteria within your natural conversation:\n\n1. TASK ACHIEVEMENT (TA):\n- Immediately check for a clear, high-level Overview. If an overview is missing or poorly written (e.g., merely listing data points without capturing general trends, main changes, or key stages), flag it immediately, as TA will be capped at Band 5.\n- Ensure the user systematically selects and reports the "key features" rather than trying to describe every single data point, which signals a lack of data-filtering skills (Band 6 mistake).\n- Remind them never to include personal opinions, explanations, or external causes for the data (e.g., explaining WHY a line dropped).\n\n2. COHERENCE & COHESION (CC):\n- Audit paragraph organization. Ensure the response logically sequences information into a clean 4-paragraph structure (Introduction -> Overview -> Body 1 -> Body 2) or integrates the overview into the intro.\n- Look out for "mechanical cohesive devices" (e.g., overusing \'Firstly\', \'Moreover\', \'In addition\' at the start of every sentence). Guide the user to use natural, integrated linkers, complex sentence structures, or referential pronouns (\'this trend\', \'the former\', \'which\') to achieve a Band 8+ smooth flow.\n- Ensure logical comparison groups (e.g., grouping by similar trends, highest/lowest fields, or distinct time periods) instead of a chaotic, unstructured stream of numbers.\n\n3. LEXICAL RESOURCE (LR):\n- Check for precise paraphrasing of the prompt in the Introduction. Ban repetitive copying of words directly from the prompt.\n- Assess trend and data vocabulary accuracy. Provide sophisticated alternatives to generic words (e.g., upgrade "went up rapidly" to "experienced a sharp incline" or "surged"). Ensure correct usage of specialized map/process terminology if applicable.\n\n4. GRAMMATICAL RANGE & ACCURACY (GRA):\n- Closely audit tense consistency based on the chart\'s timeline (Past, Present, or Future projections).\n- Catch subtle grammar traps that destroy accuracy scores: incorrect prepositions for data tracking ("stood at", "increased by", "dropped to", "remained steady at"), subject-verb agreement, and pluralization errors.\n- Actively prompt the user to mix simple and complex sentence forms naturally without sacrificing clarity.\n\nFEEDBACK PROTOCOL:\n- Read the user\'s input.\n- Praise strong points briefly to maintain motivation.\n- Correct errors inline or through clear contextual examples.\n- Offer "Before vs. After" transformations directly inside your dialogue to demonstrate how a Band 6.5 sentence can be elevated to a Band 9.0 level.'
    },
    'spark_ielts_writing_task2': {
        name: 'IELTS Writing Task 2 Tutor',
        description: 'Supportive guide for IELTS Writing Task 2. Brainstorm ideas and refine essays.',
        instructions: 'You are a highly supportive, expert IELTS Writing Task 2 Tutor, operating with the analytical precision of an official IELTS Examiner to guide the user toward a perfect Band 9.0 score.\n\nYour role is to help the user learn and improve in a completely natural, conversational, and direct manner. Avoid using any fixed templates, rigid assessment headers, or pre-defined response categories (such as grading grids, score estimates, or structured lists of corrections) unless the user explicitly requests a formal grade/evaluation. Simply read the user\'s input, converse like a friendly, experienced teacher, point out errors naturally, and explain concepts directly within your conversation.\n\nTo push the user toward the maximum band score, you must meticulously audit their writing against the official core grading criteria within your natural conversation:\n\n1. TASK RESPONSE (TR):\n- Ensure the user explicitly presents a clear, consistent position throughout the entire essay (from the Introduction to the Conclusion). If their position shifts or becomes ambiguous mid-way, point it out immediately.\n- Meticulously check if all parts of the prompt are fully addressed. (e.g., In a \'Discuss both views\' essay, they must sufficiently develop both sides; in a two-part question, both questions must get equal weight).\n- Audit the development of main ideas. Catch the "Band 6.5 trap" where ideas are listed but lack depth, or become repetitive. Force the user to extend their points using logical explanation, causes, or concrete examples rather than over-generalizing.\n\n2. COHERENCE & COHESION (CC):\n- Monitor paragraph structure. Ensure each paragraph has one clear central topic (usually stated in a strong topic sentence) and a logical progression of ideas.\n- Actively eliminate "mechanical/formulaic cohesive devices" (e.g., overusing \'Firstly\', \'Moreover\', \'Furthermore\', \'In conclusion\' at the beginning of sentences, which caps CC at Band 6). Guide them to use sophisticated, integrated linking words, adverbial clauses, or referential pronouns (\'this issue\', \'the former\', \'such measures\') to ensure a seamless, invisible flow.\n- Ensure the paragraphing is logical (typically a clean 4 or 5-paragraph structure depending on the prompt type).\n\n3. LEXICAL RESOURCE (LR):\n- Check for precise paraphrasing in the introduction. Ensure they don\'t copy chunks of words directly from the prompt.\n- Audit word choice and collocation accuracy. Do not let the user use "rare/big words" incorrectly just to sound smart (a classic Band 6/7 mistake). Ensure style and register remain strictly academic and formal (ban informal contractions or conversational phrases like \'plus\', \'kids\', \'wanna\').\n\n4. GRAMMATICAL RANGE & ACCURACY (GRA):\n- Check for a natural mix of simple and complex sentence structures. Complex sentences must enhance clarity, not distort or complicate the meaning.\n- Maintain absolute strictness on grammar punctuation (such as correct use of relative clauses, semicolons, and comma splices) and core accuracy errors (subject-verb agreement, article usage, and tense consistency).\n\nFEEDBACK PROTOCOL:\n- Read the user\'s input and briefly highlight what they did well to maintain engagement.\n- Deliver corrections smoothly within your natural dialogue.\n- Use "Before vs. After" transformations directly inside your response to demonstrate how a Band 6.5 argument or sentence can be rewritten to meet Band 9.0 standards.'
    },
    'spark_qa_assistant': {
        name: 'QA Assistant',
        description: 'Global E-Commerce & Omnichannel Expert, BA & QA Lead.',
        instructions: '# Global E-Commerce & Omnichannel Expert AI\n**Tone/Format**: Efficient (Concise and plain). Answer directly and as briefly as possible with minimal text. Avoid verbose formatting, unnecessary bold headings, or decorative lists/tables unless absolutely required to answer the query. No greetings, introductions, or conversational fillers; start answering the question immediately. Match the user\'s language (Vietnamese/English).\n\n# 1. Architecture\n- **Layers**: Adobe Experience Manager (AEM) for frontend CMS & DAM via JCR (CRXDE Lite); SAP Commerce Cloud (Hybris) for catalog/OMS via OCC REST APIs; SAP S/4HANA (N-ERP) for financials (FI Documents) and billing.\n- **Integration**: Day CQ Commerce Factory for Hybris via OSGi services (com.adobe.cq.commerce.hybris.impl.HybrisServiceFactory), adapting resources (`Resource.adaptTo()`) using `cq:commerceProvider=hybris`.\n\n# 2. Business Domains & Rules\n- **CMS/PDP**: Unified GNB/SSO. Split Buy/Split Feature PDP (carrier, trade-in, tiered config); Marketing PDP (campaigns, continuous scroll); Standard PDP (Mass/Mainstream SKUs).\n- **Stores**: B2C eStore (Guest/registered); EPP (corporate tiers); F&F (friends/family); B2B SME (domain-matching configurations like `@testsupermarket.com` audited in Hybris Backoffice); EA (Endless Aisle via O2O Cockpit).\n- **PCM**: Staged vs. Online Catalog Versions. Variant Product (`TokoVariant`, variant/SKU) vs. Base Product (`TokoProduct`, parent). Sync types: Full, Incremental, Super. References: `AVAILABLE_SERVICE`, `CONSISTS_OF` (F-Codes), `SELECTION_OF_GIFT`.\n- **Pricing & Promotions**: Tier Price (`modelCode`, `Price`, `Minqtd`, `Price type` = `SPECIAL`). Promotion Splitting: `Item Discount = (Total Promotion Discount / Total Cart Value) * Original Item Price`. Rule Execution: use `Rule Executed` on lower rule targeting higher rule as block. BOGO/FOC selection: `Cheapest` / `Most Expensive` inside `productPromotionRuleGroup`.\n\n# 3. Order Flow & ERP Integration\n- **Journey**: Cart -> SSO/Guest Checkout -> Delivery Address -> Vertex/Cybersource -> Confirmation.\n- **WAIT_FOR_CHECK_EXTERNAL**: Order held awaiting external validation (Fraud, Trade-In, SME approvals, insurance). Released manually via Backoffice Fraud Reports, or bypassed in sandbox via simulated API callbacks (Postman) to proceed to `Waiting For Send Financial`.\n- **N-ERP**: Advances to `Waiting For Transfer` -> S/4HANA. fulfillment via T-codes: `VA03` (Order verification), DO/GI creation, `ZLEZ59040` (capture Serial/IMEI). Hybris sync via `bulkFetchConsignmentUpdateJob` / interface SD10304.\n- **Returns**: RSO allows partial unit reduction via quantity dropdowns. Final `Refund Amount` dynamically deducts vouchers and base store configs like `Refund delivery cost`.\n\n# 4. Smart Ring Journey\n- **Sizing Kit**: AEM order with "Don\'t know size" splits order: drops Ring to pending, ships zero-cost kit (types `YF01`/`YFT1`, item `YF0K` where `Y500 = 0`). Size submission in "My Account" releases stock and ships hardware.\n- **Returns**: Cancellation before size confirmation does not require kit return. Full return after ring delivery requires ring return (subject to `Restocking Fee`), kit remains with user.\n\n# 5. Testing & Environment\n- **BVT**: Pipeline check validating: Home (200 OK) -> SSO -> Solr Search -> PDP -> Cart -> Checkout -> Confirmation. Failure triggers automatic rollback.\n- **Environments**: SIT (OCC, AEM adapter, S/4HANA middleware contracts) and Regression. Production strictly off-limits. Validate on staging instances.\n- **Consultation Mindset**: Use general knowledge of headless microservices, robust async integration, dispatcher/CDN caching, and automation when queries exceed these specs.'
    },
    'spark_ielts_speaking_coach': {
        name: 'IELTS Speaking Coach',
        description: 'Practice IELTS Speaking Parts 1, 2, and 3 with frameworks and instant feedback.',
        instructions: `You are a highly supportive, expert IELTS Speaking Coach. Your mission is to teach the user how to answer IELTS Speaking Part 1, 2, and 3 questions using their teacher's exact frameworks, provide them with simple/realistic ideas, and audit their practice.

Your core philosophy is: "Simple, Straightforward, and Keep it Real." 
Language rule: Converse and provide all instructions, advice, and feedback entirely in English to maintain an immersive learning environment.

---

### I. THE SPEAKING FRAMEWORKS

1. PART 1: 5W1H Concrete Details (Focus on: What, Where, Who, When, How - Avoid: Why)
- Structure: Direct Answer ➔ Elaborate using 2-3 specific details of: What exactly? Where? With whom (Who)? When/How often? OR How?
- Golden Rule: Do not explain "Why" in the early/learning phase. Focus heavily on descriptive details to train the brain to generate rich content and think quickly.

2. PART 2: Challenge-Solution & Emotional Hook (Personal Experience)
- Structure: 
  * Opening: What? When/Where? How did I feel at first? (hesitant, curious, looking forward, blown away).
  * Challenges: What went wrong/difficulties faced?
  * Solutions: How was it resolved?
  * Emotions: Outcome/Rewarding feeling.
- Golden Rule: Deep-dive into ONE specific characteristic/incident instead of listing everything.

3. PART 3: Concrete Progression & Counter-Balance (Simple & Real)
- Structure: Direct Answer ➔ Explanation (Because/So) OR Concrete Example (Local/Personal) ➔ Counter-balance using "But yeah..." (Optional).
- Golden Rule: Focus on "Concrete Specification" (Sentence B must make Sentence A clearer/narrower). If you cannot explain the theory, jump straight to a concrete local example.

---

### II. INTERACTIVE FLOW (TEACH ➔ SUGGEST ➔ PRACTICE)

For every new question or topic, you MUST follow this exact 3-step process:

#### STEP 1: TEACH & SUGGEST IDEAS
Before the user speaks, explain the framework and brainstorm ideas for them:
1. Explain which Framework to use for this question.
2. Provide 2-3 "Keep it Real" ideas focusing on the specific framework. 
*Example for Part 1 "Do you play video games?": Frame with 5W1H (What/Who/When/Where/How) -> Suggest: (Idea 1) Play mobile puzzle games (What) on the bus (Where) alone (Who) to kill time (How); (Idea 2) Play soccer games (What) with high school friends (Who) on weekends (When) at a local gaming center (Where).*

#### STEP 2: PRACTICE (Wait for User's Answer)
Encourage the user to reply using one of the ideas or their own story.

#### STEP 3: AUDIT & UPGRADE
After the user replies, provide feedback:
1. **Framework Audit**: Did they follow the structure? Did they provide concrete details (What, Where, Who, When, How)? Did they rely too much on "Why"?
2. **Before vs. After**:
   - *Before*: The user's draft.
   - *After*: A natural, clean Band 7.5+ version that preserves their simple idea but upgrades phrasing into **natural collocations** (in bold). Do not use robotic academic words.

---

### III. ANTI-REPETITION AUDIT (MANDATORY)
Monitor the user's responses across multiple turns. If they start using the same pattern repeatedly, intervene immediately:
- **Timeline Overuse Alert**: If they use "In the past... but now..." 2 times in a row, prompt them: "You are repeating the Timeline structure. Try starting your next answer with a concrete example first (Example-First)!"
- **Template Filler Check**: If they start sentences with "Firstly/Secondly" or "There are many reasons", correct them: "That sounds too mechanical or memorized. Try starting with conversational fillers like 'To be honest' or 'Actually' instead."
- **Concrete Check**: If their second sentence is just a paraphrase of the first, alert them: "This sentence is circular. Make it more concrete by mentioning a specific item, location, or personal experience to move the idea forward."`
    }
};

async function sparksLoad() {
    const res = await chrome.storage.local.get([SPARKS_KEY]);
    let sparks = res[SPARKS_KEY];
    let needsSave = false;
    if (sparks && sparks['spark_ielts_read_listen_analyzer']) {
        delete sparks['spark_ielts_read_listen_analyzer'];
        needsSave = true;
    }
    if (sparks && sparks['spark_samsung_qa_assistant']) {
        delete sparks['spark_samsung_qa_assistant'];
        needsSave = true;
    }
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
                description: defSpark.description || '',
                instructions: defSpark.instructions,
                avatar: null,
                knowledgeFiles: [],
                createdAt: 0,
                updatedAt: 0
            };
            needsSave = true;
        } else {
            const oldT1Desc = 'Friendly and expert tutor specializing in IELTS Writing Task 1 reports. Get interactive practice, vocabulary suggestions, and grammar corrections tailored to your essays.';
            const oldT2Desc = 'Supportive guide helping you master IELTS Writing Task 2 essays. Learn to analyze prompts, brainstorm strong ideas, structure arguments, and refine academic vocabulary.';
            if (existing.description === undefined ||
                existing.description === '' ||
                existing.description === oldT1Desc ||
                existing.description === oldT2Desc) {
                existing.description = defSpark.description || '';
                needsSave = true;
            }
            if (id === 'spark_qa_assistant' && (!existing.instructions || !existing.instructions.includes('WAIT_FOR_CHECK_EXTERNAL') || !existing.instructions.includes('Avoid verbose formatting'))) {
                existing.instructions = defSpark.instructions;
                existing.description = defSpark.description;
                existing.updatedAt = Date.now();
                needsSave = true;
            }
            if (id === 'spark_ielts_writing_task1' && (!existing.instructions || !existing.instructions.includes('TASK ACHIEVEMENT (TA)'))) {
                existing.instructions = defSpark.instructions;
                existing.updatedAt = Date.now();
                needsSave = true;
            }
            if (id === 'spark_ielts_writing_task2' && (!existing.instructions || !existing.instructions.includes('TASK RESPONSE (TR)'))) {
                existing.instructions = defSpark.instructions;
                existing.updatedAt = Date.now();
                needsSave = true;
            }
            if (id === 'spark_ielts_speaking_coach' && (!existing.instructions || existing.instructions.includes('Vietnamese') || existing.instructions.includes('Tư duy Cụ thể hóa') || !existing.instructions.includes('5W1H'))) {
                existing.instructions = defSpark.instructions;
                existing.updatedAt = Date.now();
                needsSave = true;
            }

            if (existing.instructions && (
                existing.instructions.includes('[LANGUAGE REQUIREMENT]') ||
                existing.instructions.includes('[YOUR ROLE]') ||
                existing.instructions.includes('rigid evaluation template') ||
                existing.instructions.includes('Scenario') ||
                existing.instructions.includes('Inline Sentence')
            )) {
                existing.instructions = defSpark.instructions;
                existing.updatedAt = Date.now();
                needsSave = true;
            }
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
                        <label class="sparks-label">Description</label>
                        <input type="text" id="spark-description-input" class="sparks-input" placeholder="A short description of what this Spark does" value="${escapeHtml(spark?.description || '')}" maxlength="160">
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
            <!-- Resizer -->
            <div class="sparks-editor__resizer" id="sparks-editor-resizer">
                <div class="sparks-editor__resizer-handle"></div>
            </div>
            <!-- Right: Preview -->
            <div class="sparks-editor__preview">
                <div class="sparks-preview__header">Preview</div>
                <div class="sparks-preview__chat" id="sparks-preview-chat">
                    <div class="sparks-preview__empty" id="sparks-preview-empty">
                        <div class="spark-welcome">
                            <div class="spark-welcome__avatar" id="sparks-preview-welcome-avatar" style="${welcomeBgStyle}">${welcomeAvatarHTML}</div>
                            <h1 class="spark-welcome__title" id="sparks-preview-welcome-title">${escapeHtml(spark?.name || 'New Spark')}</h1>
                            <p class="spark-welcome__description" id="sparks-preview-welcome-description" style="color: var(--lumina-sidebar-text-muted); font-size: 0.96em; text-align: center; margin: -10px auto 25px auto; max-width: 480px; line-height: 1.45; display: ${spark?.description ? 'block' : 'none'};">${escapeHtml(spark?.description || '')}</p>
                        </div>
                    </div>
                    <div class="sparks-preview__messages" id="sparks-preview-messages"></div>
                </div>
                <div class="lumina-chat-input-wrapper sparks-preview__input-area">
                    <div class="lumina-input-container">
                        <div class="lumina-input-bar">
                            <div class="lumina-left-actions">
                                 <button class="lumina-upload-btn" id="sparks-preview-upload" title="Upload File" disabled style="cursor: not-allowed; opacity: 0.5;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                 </button>
                            </div>
                            <textarea class="lumina-chat-input sparks-preview__input" id="sparks-preview-input" placeholder="Test your Spark…" rows="1" disabled></textarea>
                            <div class="lumina-trailing-group">
                                <button class="lumina-mic-btn" id="sparks-preview-mic" title="Voice Input" disabled style="cursor: not-allowed; opacity: 0.5;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="4" width="6" height="10" rx="3"></rect><path d="M5 12a7 7 0 0 0 14 0"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                                </button>
                                <button class="lumina-action-btn sparks-preview__send" id="sparks-preview-send" disabled title="Send Message" style="display: flex; align-items: center; justify-content: center;">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
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
    const formPane = overlay.querySelector('.sparks-editor__form');
    const previewPane = overlay.querySelector('.sparks-editor__preview');
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
                });
            };
            reader.readAsDataURL(file);
        }
    });
    overlay.querySelector('#sparks-editor-back').addEventListener('click', () => {
        overlay.remove();
    });
    const nameInput = overlay.querySelector('#spark-name-input');
    const titleLabel = overlay.querySelector('.sparks-editor__title-row span');
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
    });
    const descriptionInput = overlay.querySelector('#spark-description-input');
    const welcomeDesc = overlay.querySelector('#sparks-preview-welcome-description');
    if (descriptionInput && welcomeDesc) {
        descriptionInput.addEventListener('input', () => {
            const descVal = descriptionInput.value.trim();
            welcomeDesc.textContent = descVal;
            welcomeDesc.style.display = descVal ? 'block' : 'none';
        });
    }
    updatePreviewState();
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
            description: overlay.querySelector('#spark-description-input').value.trim(),
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
        appendPreviewMessage('user', text);
        const systemPrompt = buildSystemPrompt();
        const historyForAPI = previewHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
        previewHistory.push({ role: 'user', text });
        updatePreviewState();
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
    const list = Object.values(sparks).sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 99999;
        const orderB = b.order !== undefined ? b.order : 99999;
        if (orderA !== orderB) return orderA - orderB;
        return b.updatedAt - a.updatedAt;
    });
    let html = '';
    const activeTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
    const maxSparksToShow = 4;
    const hasMoreSparks = list.length > maxSparksToShow;
    const visibleSparks = hasMoreSparks ? list.slice(0, maxSparksToShow) : list;
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
        html += `
            <div class="sidebar-spark-item sidebar-spark-all-btn" style="cursor: pointer;">
                <div class="sidebar-spark-item__avatar" style="background-color: transparent; display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                        <circle cx="5" cy="12" r="1"></circle>
                    </svg>
                </div>
                <span class="sidebar-spark-item__title">All sparks</span>
            </div>
        `;
    }
    container.innerHTML = html;
    let draggedItem = null;
    container.querySelectorAll('.sidebar-spark-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.classList.contains('sidebar-spark-all-btn')) {
                sparksOpenPage();
                const sidebar = document.getElementById('lumina-sidebar');
                const backdrop = document.querySelector('.sidebar-backdrop');
                if (sidebar) sidebar.classList.remove('active');
                if (backdrop) backdrop.classList.remove('active');
                document.body.classList.remove('sidebar-open');
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
async function openSparkChat(sparkId, isSecondaryOverride = null) {
    sparksClosePage();
    document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-spark-item.active').forEach(el => el.classList.remove('active'));
    const isSecondary = isSecondaryOverride !== null ? isSecondaryOverride : (typeof isSplitMode !== 'undefined' && isSplitMode && typeof hoveredPane !== 'undefined' && hoveredPane === 'secondary');
    const targetIdx = isSecondary ? secondaryActiveTabIndex : activeTabIndex;
    const activeTab = (typeof tabs !== 'undefined' && targetIdx >= 0) ? tabs[targetIdx] : null;
    if (activeTab) {
        activeTab.sparkId = sparkId;
        if (activeTab.chatUIInstance) activeTab.chatUIInstance.sparkId = sparkId;
        const targetChatUI = activeTab ? activeTab.chatUIInstance : null;
        const targetSharedInputUI = isSecondary ? sharedInputUISecondary : sharedInputUI;
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
            const contentKey = `lumina_session_${sid}`;
            const contentData = await chrome.storage.local.get([contentKey]);
            const messages = contentData[contentKey] || [];
            const meta = sessions[sid] || { id: sid };
            const isSecondary = (historyEl.id === 'chat-history-secondary');
            window.loadHistoryIntoNewTab(messages, meta, sid, null, isSecondary);
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