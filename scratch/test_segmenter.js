const text = "The name of the runner was also inscribed on the platform as a token of thanks.In the earlier days, torches used everything from gunpowder to olive oil as fuels.";
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const segments = segmenter.segment(text);
for (const { segment } of segments) {
    console.log("Segment:", JSON.stringify(segment));
}
