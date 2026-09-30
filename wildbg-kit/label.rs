// Labeller used to train the in-page evaluation net (see CLAUDE.md, "Evaluation net").
// Build it inside a wildbg checkout, using the strong nets from the `nets` branch:
//   git clone -b nets https://github.com/carsten-wenderdel/wildbg && cd wildbg
//   cp <this repo>/wildbg-kit/label.rs crates/engine/examples/
//   cargo build --release -p engine --example label
//   target/release/examples/label < positions.txt > labels.txt
// Reads positions (26 ints per line, wildbg "mover" frame: player on roll positive,
// moving 24->1, index 25 = own bar, index 0 = opponent's bar) and prints wildbg's cubeless
// probabilities for the player on roll: win, win_gammon+, win_bg, lose_gammon+, lose_bg.
use engine::composite::CompositeEvaluator;
use engine::evaluator::Evaluator;
use engine::position::Position;
use std::io::{self, BufRead, BufWriter, Write};

fn main() {
    let ev = CompositeEvaluator::try_default().expect("nets");
    let stdin = io::stdin();
    let mut out = BufWriter::new(io::stdout().lock());
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        let v: Vec<i8> = line.split_whitespace().map(|s| s.parse().unwrap()).collect();
        if v.len() != 26 { writeln!(out, "nan nan nan nan nan").unwrap(); continue; }
        let mut pips = [0i8; 26];
        pips.copy_from_slice(&v);
        match Position::try_from(pips) {
            Ok(pos) => {
                let p = ev.eval(&pos);
                writeln!(out, "{:.5} {:.5} {:.5} {:.5} {:.5}", p.win(), p.win_gammon + p.win_bg, p.win_bg,
                    p.lose_gammon + p.lose_bg, p.lose_bg).unwrap();
            }
            Err(_) => writeln!(out, "nan nan nan nan nan").unwrap(),
        }
    }
}
