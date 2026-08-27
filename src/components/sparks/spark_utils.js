const SPARK_GRADIENTS = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #3b82f6, #06b6d4)',
    'linear-gradient(135deg, #0ea5e9, #10b981)',
    'linear-gradient(135deg, #10b981, #84cc16)',
    'linear-gradient(135deg, #f59e0b, #f97316)',
    'linear-gradient(135deg, #ec4899, #f43f5e)',
    'linear-gradient(135deg, #8b5cf6, #d946ef)',
    'linear-gradient(135deg, #14b8a6, #3b82f6)',
    'linear-gradient(135deg, #f43f5e, #fb923c)',
    'linear-gradient(135deg, #0284c7, #6366f1)'
];

export function getSparkColor(name) {
    if (!name) return SPARK_GRADIENTS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SPARK_GRADIENTS[Math.abs(hash) % SPARK_GRADIENTS.length];
}

export function buildSparkSystemPrompt(spark, memoryFacts = []) {
    if (!spark) return '';
    let prompt = spark.systemPrompt || '';
    if (spark.knowledgeBase && spark.knowledgeBase.length > 0) {
        prompt += '\n\n=== KNOWLEDGE BASE ===\n';
        prompt += spark.knowledgeBase.map(k => `[${k.name}]: ${k.content}`).join('\n\n');
    }
    if (Array.isArray(memoryFacts) && memoryFacts.length > 0) {
        prompt += '\n\n=== USER MEMORY FACTS ===\n';
        prompt += memoryFacts.map(f => `- ${f}`).join('\n');
    }
    return prompt;
}

export function clampCropPosition(pos, maxOffset) {
    return Math.max(-maxOffset, Math.min(maxOffset, pos));
}

export function computeCropTransform(scale, offsetX, offsetY) {
    return `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

export function computeZoomScale(currentScale, delta, minScale = 1, maxScale = 3) {
    const next = currentScale + delta;
    return Math.max(minScale, Math.min(maxScale, next));
}
