"""Trains the evaluation net (EVAL_NET in engine.js) to copy wildbg's probabilities.

Input: float32 matrices written by tools/net-features.js (<prefix>.x, <prefix>.y).
  python3 tools/train-net.py <out.json> <val-prefix> <train-prefix>... [--hidden 128,64] [--epochs 30]
Outputs (sigmoid): win, win gammon+, win backgammon, lose gammon+, lose backgammon, all for
the player on roll. Needs numpy only. Writes weights as JSON for tools/pack-net.js.
"""
import json, sys, time
import numpy as np

args = sys.argv[1:]
def opt(name, default):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default
hidden = [int(h) for h in opt('--hidden', '128').split(',')]
epochs = int(opt('--epochs', '30'))
seed = int(opt('--seed', '1'))
out, val, *train = args
NIN = 225
def load(p):
    x = np.fromfile(p + '.x', dtype=np.float32).reshape(-1, NIN)
    y = np.fromfile(p + '.y', dtype=np.float32).reshape(-1, 5)
    return x, y
X, Y = zip(*[load(p) for p in train]); X = np.concatenate(X); Y = np.concatenate(Y)
Xv, Yv = load(val)
mu = X.mean(0); sd = X.std(0); sd[sd < 1e-6] = 1
Z = (X - mu) / sd; Zv = (Xv - mu) / sd
rng = np.random.default_rng(seed)
sizes = [NIN] + hidden + [5]
W = [rng.normal(0, np.sqrt(1 / sizes[i]), (sizes[i], sizes[i + 1])).astype(np.float32) for i in range(len(sizes) - 1)]
B = [np.zeros(s, np.float32) for s in sizes[1:]]
P = W + B
M = [np.zeros_like(p) for p in P]; V = [np.zeros_like(p) for p in P]
sig = lambda t: 1 / (1 + np.exp(-t))

def forward(z):
    hs = [z]
    for i in range(len(W) - 1): hs.append(np.tanh(hs[-1] @ W[i] + B[i]))
    return hs, sig(hs[-1] @ W[-1] + B[-1])

contact = Xv[:, 24 * 8 + 4 + 1] > 0.5  # probFeatures' contact flag
def report():
    _, o = forward(Zv)
    e = np.abs(o - Yv)
    eq = lambda p: (2 * p[:, 0] - 1) + (p[:, 1] - p[:, 3]) + (p[:, 2] - p[:, 4])
    qe = np.abs(eq(o) - eq(Yv))
    f = lambda m: f"win {e[m, 0].mean() * 100:.2f}pp gw {e[m, 1].mean() * 100:.2f} gl {e[m, 3].mean() * 100:.2f} eq {qe[m].mean():.4f}"
    return f"contact: {f(contact)} | race: {f(~contact)}", e[:, 0].mean()

lr0, bs, l2, b1, b2 = 2e-3, 256, 1e-6, 0.9, 0.999
step = 0; best = (1e9, None)
for ep in range(epochs):
    t0 = time.time(); perm = rng.permutation(len(Z)); lr = lr0 * (0.5 ** (ep / (epochs / 4)))
    for s in range(0, len(Z), bs):
        idx = perm[s:s + bs]; z = Z[idx]; y = Y[idx]
        hs, o = forward(z)
        d = (o - y) / len(idx)  # cross-entropy gradient wrt logits
        gW = [None] * len(W); gB = [None] * len(B)
        for i in range(len(W) - 1, -1, -1):
            gW[i] = hs[i].T @ d + l2 * W[i]; gB[i] = d.sum(0)
            if i: d = (d @ W[i].T) * (1 - hs[i] ** 2)
        step += 1
        for j, g in enumerate(gW + gB):
            M[j] = b1 * M[j] + (1 - b1) * g; V[j] = b2 * V[j] + (1 - b2) * g * g
            P[j] -= lr * (M[j] / (1 - b1 ** step)) / (np.sqrt(V[j] / (1 - b2 ** step)) + 1e-8)
    msg, mae = report()
    print(f"ep {ep:2d} {time.time() - t0:5.1f}s lr {lr:.5f}  {msg}", flush=True)
    if mae < best[0]: best = (mae, [p.copy() for p in P])
P = best[1]; W = P[:len(W)]; B = P[len(W):]
json.dump({'mu': mu.tolist(), 'sd': sd.tolist(), 'W': [w.T.tolist() for w in W], 'B': [b.tolist() for b in B]}, open(out, 'w'))
print('best val win MAE', round(best[0] * 100, 3), 'pp ->', out)
