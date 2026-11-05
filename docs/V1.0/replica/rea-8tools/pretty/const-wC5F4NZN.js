var e = {
    0: `最不相似`,
    25: `少许相似`,
    50: `一半相似`,
    75: `非常相似`,
    100: `极度相似`,
  },
  t = { 1: `通用`, 2: `人像`, 3: `商品`, 9: `服装`, 12: `头发`, 13: `头像` },
  n = { 1: `预设模特`, 2: `固定模特`, 3: `专属模特`, 4: `模特市场` },
  r = (e) => {
    switch (e) {
      case 0.5625:
        return `16:9`;
      case 1.777777:
      case 1.7778:
        return `9:16`;
      case 0.75:
        return `4:3`;
      case 1.333333:
      case 1.3333:
        return `3:4`;
      case 2:
        return `1:2`;
      case 0.5:
        return `2:1`;
      case 1:
        return `1:1`;
      default:
        return `原始比例`;
    }
  };
export { r as i, n, e as r, t };
