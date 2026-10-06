function dots(count = 32) {
  return Array.from({ length: Math.max(0, Math.min(80, Number(count) || 32)) }, (_, id) => {
    const edge = id % 10 !== 9;
    const side = id % 4;
    const along = 2 + ((id * 37) % 96);
    const inset = 1 + ((id * 7) % 10);
    let x = 18 + ((id * 37) % 64), y = 18 + ((id * 61) % 64);
    if (edge) {
      x = side === 0 ? inset : side === 1 ? 100 - inset : along;
      y = side === 2 ? inset : side === 3 ? 100 - inset : along;
    }
    return { id, x, y, side, edge, opacity: edge ? .82 : .18, delay: -(id % 14) };
  });
}

module.exports = { dots };
