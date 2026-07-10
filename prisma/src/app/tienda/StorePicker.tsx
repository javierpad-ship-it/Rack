'use client';

import { useState, useTransition } from 'react';
import type { PrismaStore } from '@/lib/store';
import { selectStore } from './actions';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function StorePicker({ stores, selected }: { stores: PrismaStore[]; selected: string | null }) {
  const [pick, setPick] = useState<string>(selected ?? stores[0]?.id ?? '');
  const [pending, start] = useTransition();

  return (
    <>
      <div className="store-list">
        {stores.map((s) => (
          <button
            key={s.id}
            className={'store-item' + (pick === s.id ? ' sel' : '')}
            onClick={() => setPick(s.id)}
            type="button"
          >
            <span className="ic">{initials(s.name)}</span>
            <span>
              <span className="nm">{s.name}</span>
              <br />
              <span className="cd">{[s.code, s.sales_org].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="rad" />
          </button>
        ))}
      </div>
      <button className="btn primary" disabled={!pick || pending} onClick={() => start(() => selectStore(pick))}>
        {pending ? 'Entrando…' : 'Continuar'}
      </button>
      <p className="mini" style={{ textAlign: 'center' }}>
        Podrás cambiar de tienda cuando quieras desde el chip superior.
      </p>
    </>
  );
}
