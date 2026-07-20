
var LUMINA_DEFAULTS = {
    provider: 'groq',
    groqModel: 'llama3-8b-8192',
    geminiModel: 'gemini-2.5-flash-lite',
    openrouterModel: 'openai/gpt-4o-mini',
    responseLanguage: 'en',
    disabledDomains: [],
    maxContextTokens: null,
    readWebpage: true,
    reasoningMode: false,
    enableWebSearch: true
};

if (typeof self.LUMINA_CONSTANTS_INITIALIZED === 'undefined') {
    self.LUMINA_CONSTANTS_INITIALIZED = true;
    var LUMINA_PROVIDERS = {
    groq: {
        link: 'https://console.groq.com/keys',
        modelsUrl: 'https://api.groq.com/openai/v1/models',
        defaultModel: 'llama3-8b-8192'
    },
    gemini: {
        link: 'https://aistudio.google.com/app/apikey',
        modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        defaultModel: 'gemini-2.0-flash-exp'
    },
    openrouter: {
        link: 'https://openrouter.ai/keys',
        modelsUrl: 'https://openrouter.ai/api/v1/models',
        defaultModel: 'openai/gpt-4o-mini'
    },
    cerebras: {
        link: 'https://cloud.cerebras.ai/platform',
        modelsUrl: 'https://api.cerebras.ai/v1/models',
        defaultModel: 'llama3.1-8b'
    },
    mistral: {
        link: 'https://console.mistral.ai/api-keys',
        modelsUrl: 'https://api.mistral.ai/v1/models',
        defaultModel: 'mistral-small-latest'
    }
};
var LUMINA_DEFAULT_SHORTCUTS = {
    'luminaChat': { key: 'Space', modifiers: ['Alt'] },
    'askLumina': { key: 'L', modifiers: ['Alt'] },
    'audio': { key: 'Shift', modifiers: [] },
    'translate': { key: 'T', modifiers: ['Alt'] },
    'micToggle': { key: 'M', modifiers: ['Alt'] },
    'translateInput': { key: 'E', modifiers: ['Alt'] },
    'retry': { key: 'R', modifiers: ['Alt'] },
    'annotationShortcuts': [
        { key: 'h', code: 'KeyH', color: '#FFFB78' }
    ]
};
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
function getKeysArray(keyStr) {
    if (!keyStr) return [];
    return keyStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
}
var LUMINA_DEFAULT_SKILLS = [
    {
        id: 'vocab_builder',
        name: 'Vocabulary Builder',
        description: 'Phân tích từ mới, cung cấp phiên âm IPA, dịch nghĩa, ví dụ thực tế và từ đồng nghĩa.',
        prompt: 'Khi tôi gửi một hoặc nhiều từ vựng mới, hãy phân tích chi tiết từ đó theo cấu trúc sau:\n1. **Từ vựng**: [Từ đó] ([Từ loại])\n2. **Phiên âm IPA**: [Phiên âm chuẩn UK/US]\n3. **Nghĩa tiếng Việt**: [Dịch nghĩa ngắn gọn và chuẩn xác nhất]\n4. **Cách dùng theo ngữ cảnh**:\n   - [Ngữ cảnh 1 (ví dụ: Giao tiếp thường ngày, Học thuật...)]: [Mô tả cách dùng]\n   - [Ngữ cảnh 2 (nếu có)]: [Mô tả cách dùng]\n5. **Ví dụ thực tế**:\n   - *[Câu ví dụ tiếng Anh]* -> [Dịch nghĩa câu ví dụ]\n6. **Từ đồng nghĩa & Trái nghĩa**:\n   - Đồng nghĩa: [Từ 1, Từ 2]\n   - Trái nghĩa: [Từ 1, Từ 2]\nHãy giữ định dạng sạch sẽ, dễ đọc bằng Markdown.',
        type: 'general',
        enabled: true
    },
    {
        id: 'ielts_brainstormer',
        name: 'IELTS Task 2 Brainstormer',
        description: 'Hướng dẫn tư duy, phân tích đề bài và xây dựng dàn ý chi tiết cho IELTS Writing Task 2.',
        prompt: 'Bạn là một Giám khảo IELTS kỳ cựu. Khi tôi gửi một đề bài IELTS Writing Task 2, hãy thực hiện các bước sau:\n1. **Phân tích đề (Task Analysis)**: Xác định dạng bài (Agree/Disagree, Discussion, Cause-Effect...), chủ đề chính (Topic), và các khía cạnh cần trả lời.\n2. **Dàn ý ý tưởng (Brainstorming Matrix)**:\n   - **Hướng tiếp cận 1 (Side A / Supporting Idea 1)**: Nêu 2 luận điểm (Arguments) kèm theo giải thích ngắn (Explanation) và ví dụ (Examples).\n   - **Hướng tiếp cận 2 (Side B / Supporting Idea 2)**: Nêu 2 luận điểm kèm theo giải thích ngắn và ví dụ.\n3. **Từ vựng đắt giá (Collocations/Topic Vocabulary)**: Gợi ý 5-7 cụm từ band 7.0+ thuộc chủ đề này kèm nghĩa và câu ví dụ minh họa.\n*Lưu ý: Không viết cả bài essay, chỉ tập trung gợi mở tư duy và cung cấp dàn ý tối ưu.*',
        type: 'general',
        enabled: true
    },
    {
        id: 'ielts_grader',
        name: 'IELTS Essay Grader',
        description: 'Đánh giá chi tiết bài viết IELTS Writing Task 2 dựa trên 4 tiêu chí chuẩn của BC/IDP và cho điểm ước lượng.',
        prompt: 'Hãy đóng vai làm Giám khảo chấm thi IELTS. Tôi sẽ gửi cho bạn một bài viết Writing Task 2 (có thể kèm đề bài). Hãy đánh giá bài viết theo đúng 4 tiêu chí chuẩn:\n1. **Task Achievement (TA)**: Đánh giá khả năng trả lời đề bài, độ dài và độ hoàn thiện của bài luận.\n2. **Coherence and Cohesion (CC)**: Đánh giá sự mạch lạc, liên kết giữa các câu, các đoạn và cách sử dụng từ nối.\n3. **Lexical Resource (LR)**: Đánh giá vốn từ vựng, độ tự nhiên, cách dùng collocation và lỗi chính tả.\n4. **Grammatical Range and Accuracy (GRA)**: Đánh giá sự đa dạng cấu trúc ngữ pháp và độ chính xác của các câu.\n\nĐầu ra yêu cầu:\n- **Band Score Ước lượng**: [Ví dụ: 6.5] (và điểm thành phần cho từng tiêu chí).\n- **Phân tích chi tiết**: Chỉ ra các lỗi sai cụ thể (từ vựng, ngữ pháp, diễn đạt) kèm câu sửa lại tốt hơn.\n- **Bài viết viết lại mẫu (Sample Essay)**: Viết lại bài của tôi ở mức Band 8.0+ để tôi học tập các cấu trúc nâng cao.',
        type: 'general',
        enabled: true
    }
];

if (typeof self !== 'undefined') {
    self.LUMINA_DEFAULTS = LUMINA_DEFAULTS;
    self.LUMINA_PROVIDERS = LUMINA_PROVIDERS;
    self.LUMINA_DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS;
    self.LUMINA_DEFAULT_SKILLS = LUMINA_DEFAULT_SKILLS;
    self.escapeHtml = escapeHtml;
    self.getTodayString = getTodayString;
    self.getKeysArray = getKeysArray;
}
}
