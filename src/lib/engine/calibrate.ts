/** Transparent calibration: logistic regression on play outcomes → normalised, non-negative weights. Admin approves. */
export type Sample = { x: [number, number, number, number]; y: 0 | 1 };
const sig = (z: number) => 1 / (1 + Math.exp(-z));

export function fitLogistic(data: Sample[], iters = 3000, lr = 0.5) {
  let w = [0, 0, 0, 0], b = 0;
  const n = data.length;
  for (let it = 0; it < iters; it++) {
    const g = [0, 0, 0, 0]; let gb = 0;
    for (const s of data) {
      const p = sig(b + s.x.reduce((a, v, i) => a + v / 100 * w[i], 0));
      const e = p - s.y;
      s.x.forEach((v, i) => (g[i] += e * v / 100)); gb += e;
    }
    w = w.map((wi, i) => wi - lr * (g[i] / n + 0.01 * wi)); b -= lr * gb / n;
  }
  return { w, b };
}

export function auc(scores: number[], ys: number[]) {
  const pos = scores.filter((_, i) => ys[i] === 1), neg = scores.filter((_, i) => ys[i] === 0);
  if (!pos.length || !neg.length) return null;
  let s = 0; for (const p of pos) for (const q of neg) s += p > q ? 1 : p === q ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

export function calibrate(data: Sample[], current: { fit: number; intent: number; timing: number; access: number }) {
  if (data.length < 30 || !data.some((d) => d.y) || !data.some((d) => !d.y)) return null;
  const { w } = fitLogistic(data);
  const pos = w.map((x) => Math.max(0.02, x));
  const sum = pos.reduce((a, b) => a + b, 0);
  const nw = { fit: +(pos[0] / sum).toFixed(2), intent: +(pos[1] / sum).toFixed(2), timing: +(pos[2] / sum).toFixed(2), access: +(pos[3] / sum).toFixed(2) };
  const score = (ww: typeof nw) => data.map((d) => d.x[0] * ww.fit + d.x[1] * ww.intent + d.x[2] * ww.timing + d.x[3] * ww.access);
  const ys = data.map((d) => d.y);
  return { weights: nw, aucBefore: auc(score(current), ys), aucAfter: auc(score(nw), ys), n: data.length, raw: w };
}
