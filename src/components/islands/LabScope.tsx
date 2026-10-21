import { useRef, useState } from 'preact/hooks';

export interface ScopeGroup {
  id: string;
  label: string;
  items: string[];
}

/** Табы «Область аккредитации»: 5 групп, 28 объектов */
export default function LabScope({ groups }: { groups: ScopeGroup[] }) {
  const [picked, setPicked] = useState(groups[0].id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = groups.find((g) => g.id === picked) || groups[0];

  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % groups.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + groups.length) % groups.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = groups.length - 1;
    if (n >= 0) {
      e.preventDefault();
      setPicked(groups[n].id);
      refs.current[n]?.focus();
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Группы объектов испытаний" class="chips" style="margin-bottom:24px">
        {groups.map((g, i) => (
          <button
            key={g.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={'tab-' + g.id}
            aria-selected={g.id === picked}
            aria-controls={'panel-' + g.id}
            tabIndex={g.id === picked ? 0 : -1}
            class="chip"
            onClick={() => setPicked(g.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {g.label} · {g.items.length}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={'panel-' + cur.id} aria-labelledby={'tab-' + cur.id} tabIndex={0} class="rows">
        <ul style="margin:0;padding:0;list-style:none">
          {cur.items.map((x) => (
            <li key={x} class="row">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C79A12" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:3px"><path d="m5 12 5 5 9-10" /></svg>
              <span style="font-weight:600">{x}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
