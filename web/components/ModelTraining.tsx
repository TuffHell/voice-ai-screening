"use client";
import { motion } from "framer-motion";
import { Github, BookOpen } from "lucide-react";

const STEPS = [
  {
    title: "1 · Pull TORGO",
    body: "~9.6 GB control + dysarthric speech from the University of Toronto.",
    code: `mkdir TORGO_raw && cd TORGO_raw
for f in F FC M MC; do
  curl -L "http://www.cs.toronto.edu/~complingweb/data/TORGO/$f.tar.bz2" -o "$f.tar.bz2"
  tar -xjf "$f.tar.bz2"
done
cd .. && python -m voice_ai_v2.data.download \\
  --source torgo --raw_dir ./TORGO_raw --target ./data`,
  },
  {
    title: "2 · UASpeech mirrors (Hugging Face)",
    body: "Five extra dysarthric speakers from severity_high + seven from severity_low.",
    code: `python -c "from huggingface_hub import snapshot_download
snapshot_download('ngdiana/uaspeech_severity_high', repo_type='dataset', local_dir='./UASpeech_hf2')
snapshot_download('ngdiana/uaspeech_severity_low',  repo_type='dataset', local_dir='./UASpeech_low')"`,
  },
  {
    title: "3 · LibriTTS-R for control diversity",
    body: "Twenty-five extra healthy speakers, dev.clean parquet shards.",
    code: `python -c "from huggingface_hub import hf_hub_download
for i in range(4):
    hf_hub_download(repo_id='mythicinfinity/libritts_r', repo_type='dataset',
                    filename=f'data/dev.clean/dev.clean-{i:05d}-of-00004.parquet',
                    local_dir='./LibriTTS_dev')"`,
  },
  {
    title: "4 · APROCSA aphasia",
    body: "47 chunks from speaker 1554 — the only real aphasia source.",
    code: `mkdir APROCSA_raw && cd APROCSA_raw
gdown --folder \\
  "https://drive.google.com/drive/folders/1uBesCLdBgghTS1TLs51hsb13qt6q78WX" -O .`,
  },
  {
    title: "5 · Train",
    body: "Frozen HuBERT-base + focal loss + augmentation. ~30 min on Apple Silicon.",
    code: `AUGMENT_N=2 python -m voice_ai_v2.train \\
  --data_dir ./data --output_dir ./model_v2 \\
  --epochs 120 --max_per_speaker 25 --lr 1.5e-4`,
  },
];

export default function ModelTraining() {
  return (
    <section id="training" className="relative px-6 sm:px-12 max-w-7xl mx-auto py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between flex-wrap gap-4 mb-12"
      >
        <div>
          <span className="eyebrow">Reproduce the model</span>
          <h2 className="display text-4xl sm:text-5xl mt-6 mb-3 gradient-title">
            Every dataset is public.
          </h2>
          <p className="text-ice-100/65 max-w-2xl leading-relaxed">
            No proprietary data, no secret weights. Five commands and ~30
            minutes on Apple Silicon and you have the same speaker-disjoint
            96.21% model running locally.
          </p>
        </div>
        <a
          href="https://github.com/TuffHell/voice-ai-screening"
          target="_blank" rel="noreferrer noopener"
          className="btn-ghost"
        >
          <Github className="w-4 h-4" /> View source
        </a>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            className="glass p-7 flex flex-col"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.55, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start gap-3 mb-3">
              <BookOpen className="w-4 h-4 text-ice-300 mt-1 shrink-0" />
              <div>
                <div className="font-display text-xl text-ice-50">{s.title}</div>
                <div className="text-sm text-ice-100/55 mt-1">{s.body}</div>
              </div>
            </div>
            <pre className="font-mono text-[12px] text-ice-200/85 leading-relaxed
                            bg-black/35 border border-white/[0.06] rounded-xl
                            p-4 mt-3 overflow-x-auto whitespace-pre">{s.code}</pre>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
