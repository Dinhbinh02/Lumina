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
