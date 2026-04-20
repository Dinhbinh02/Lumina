const LuminaRAG = require('./lib/utils/rag_utils.js');

const text = `
The quick brown fox jumps over the lazy dog. 
This is a chunk about fruits like apples and oranges.
Another chunk discussing AI agents and machine learning models.
A final chunk talking about space exploration and NASA.
`;

const chunks = LuminaRAG.chunkText(text, 50, 10);
console.log('Chunks:', chunks);

const ranked = LuminaRAG.rankChunks(chunks, 'What fruit do you like?');
console.log('Ranked for fruit:', ranked);

const rankedAI = LuminaRAG.rankChunks(chunks, 'machine learning agent');
console.log('Ranked for AI:', rankedAI);
