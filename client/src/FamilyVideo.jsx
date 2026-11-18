import { useState } from 'react';
import { api } from './api.js';
import { Field, Icon, Modal, VideoModal, useApp } from './components.jsx';
import { formatTime, parseTime, skillLabel, splitVideo, videoAt } from './util.js';

/**
 * One video for a whole skill family: paste the link once, then give each step its start time.
 * Each step's video link is saved as that video starting (and optionally stopping) at its part.
 */
export default function FamilyVideo({ family, onClose }) {
  const { run, toast } = useApp();
  const steps = family.skills;
  const first = steps.map((s) => splitVideo(s.video_url)).find((v) => v.base);
  const [base, setBase] = useState(first?.base || '');
  const [times, setTimes] = useState(() => Object.fromEntries(steps.map((s) => {
    const v = splitVideo(s.video_url);
    return [s.id, v.base && v.base === first?.base ? formatTime(v.start ?? 0) : ''];
  })));
  const [stopAtNext, setStopAtNext] = useState(() => steps.some((s) => splitVideo(s.video_url).end) || !first);
  const [preview, setPreview] = useState(null);

  const parsed = steps.map((s) => ({ s, start: parseTime(times[s.id]) }));
  const bad = steps.filter((s) => times[s.id]?.trim() && parseTime(times[s.id]) === null);

  // End of a step = the next later start time among the other steps.
  const endFor = (start) => {
    if (!stopAtNext || start === null) return null;
    const later = parsed.map((p) => p.start).filter((t) => t !== null && t > start).sort((a, b) => a - b);
    return later[0] ?? null;
  };
  const linkFor = (s) => {
    const start = parseTime(times[s.id]);
    if (!base.trim() || start === null) return '';
    return videoAt(base.trim(), start, endFor(start));
  };

  async function save() {
    if (bad.length) { toast(`Check the time for “${bad[0].name}” (use 1:23 or 83)`, 'err'); return; }
    await run(async () => {
      for (const s of steps) {
        const link = linkFor(s);
        const old = splitVideo(s.video_url).base;
        // leave steps with their own separate video alone when no time is entered
        if (!link && old && old !== first?.base) continue;
        if (link !== s.video_url) await api.updateSkill(s.id, { video_url: link });
      }
    }, `Videos saved for ${family.name}`);
    onClose();
  }

  return (
    <Modal title={`Family video · ${family.name}`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <Field label="Video for the whole family" hint="Paste a YouTube, Vimeo or .mp4 link">
        <input type="url" inputMode="url" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://youtu.be/…" autoFocus={!base} />
      </Field>
      <p className="muted small">Type where each step starts in the video, like <b>0:45</b> or <b>1:30</b>. Leave a time blank for a step with no video.</p>
      <table className="fv-table">
        <thead><tr><th>#</th><th>Step</th><th>Starts at</th><th aria-label="Preview" /></tr></thead>
        <tbody>
          {steps.map((s, i) => {
            const invalid = bad.includes(s);
            const start = parseTime(times[s.id]);
            const end = endFor(start);
            return (
              <tr key={s.id}>
                <td className="seq-cell"><span className="seq">{i + 1}</span></td>
                <td>{skillLabel(s)}{start !== null && end !== null && <small className="muted"> · plays {formatTime(start)}–{formatTime(end)}</small>}</td>
                <td><input className={`time-in ${invalid ? 'invalid' : ''}`} value={times[s.id]} placeholder="0:00" inputMode="numeric"
                  aria-label={`Start time for ${s.name}`} onChange={(e) => setTimes((t) => ({ ...t, [s.id]: e.target.value }))} /></td>
                <td>
                  <button className="icon-btn accent" aria-label={`Preview ${s.name}`} disabled={!linkFor(s)}
                    onClick={() => setPreview({ url: linkFor(s), title: skillLabel(s) })}><Icon name="play" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="opt"><input type="checkbox" checked={stopAtNext} onChange={(e) => setStopAtNext(e.target.checked)} />
        Stop each clip where the next step starts (YouTube and .mp4)</label>
      {preview && <VideoModal url={preview.url} title={preview.title} onClose={() => setPreview(null)} />}
    </Modal>
  );
}
