const testCases = [
    "Others, however, (e.g. Greider & Garkovich, 1994) assert that meanings are based on social categories.",
    "This is a test (i.e. a demonstration) of the new logic.",
    "He likes apples, etc. and oranges.",
    "Dr. Smith said hello."
];

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

testCases.forEach(text => {
    console.log("\nTesting:", text);
    const segments = segmenter.segment(text);
    const initialParts = [];
    for (const { segment } of segments) {
        initialParts.push(segment);
    }

    const finalParts = [];
    for (let i = 0; i < initialParts.length; i++) {
        const part = initialParts[i];
        const trimmed = part.trim();
        if (!trimmed) continue;

        const isBullet = trimmed.length <= 3 && /^[A-Za-z0-9][\.\)]?$/i.test(trimmed);
        const endsWithAbbr = /(?:^|\s|\()(?:St|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Co|Approx|Vs|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|e\.g|i\.e|viz|cf|etc)\.$/i.test(trimmed);
        const endsWithInitial = /(?:^|\s)[A-Z]\.$/.test(trimmed);

        if ((isBullet || endsWithAbbr || endsWithInitial) && i < initialParts.length - 1) {
            initialParts[i + 1] = part + initialParts[i + 1];
        } else {
            finalParts.push(part);
        }
    }

    console.log("Final Sentences:");
    finalParts.forEach((s, idx) => console.log(`${idx}: ${s.trim()}`));
});
