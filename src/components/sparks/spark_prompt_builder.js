const SPARK_COLORS = [
    '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80',
    '#34d399', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8',
    '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb7185'
];

export function getSparkColor(name) {
    if (!name) return SPARK_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SPARK_COLORS[Math.abs(hash) % SPARK_COLORS.length];
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
