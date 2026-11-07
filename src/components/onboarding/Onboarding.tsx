'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  canContinue, finishSiteRead, initialState, SECTIONS, SECTION_OF, siteFailed, SKIPPABLE, STEPS, withAutofill,
  type State, type StepId,
} from '@/lib/onboarding/state';
import type { SiteInfo } from '@/lib/onboarding/data';
import type { ViralVideo } from '@/lib/onboarding/viral';
import { Icon } from './icons';
import { btn, cx } from './ui';
import RoleStep from './steps/RoleStep';
import SiteStep from './steps/SiteStep';
import ProductsStep from './steps/ProductsStep';
import NicheStep from './steps/NicheStep';
import SocialsStep from './steps/SocialsStep';
import CompetitorsStep from './steps/CompetitorsStep';
import EdgeStep from './steps/EdgeStep';
import VideosStep from './steps/VideosStep';
import DoneStep from './steps/DoneStep';

export type Setter = (fn: (s: State) => State) => void;
export type StepProps = { s: State; set: Setter; toast: (msg: string) => void };

const STEP_VIEWS: Record<StepId, ComponentType<StepProps>> = {
  role: RoleStep, site: SiteStep, products: ProductsStep, niche: NicheStep, socials: SocialsStep,
  comps: CompetitorsStep, beliefs: EdgeStep, videos: VideosStep, done: DoneStep,
};

const TITLES: Record<StepId, (s: State) => string> = {
  role: () => 'Who are you?',
  site: () => 'What do you do?',
  products: () => 'What do you sell?',
  niche: () => 'What’s your niche?',
  socials: () => 'What do you post now?',
  comps: () => 'Who are your competitors?',
  beliefs: () => 'What’s your edge?',
  videos: () => 'Which videos should we learn from?',
  done: s => (s.role === 'agency' && s.client.trim() ? `${s.client.trim()}’s videos` : 'Your videos'),
};

const NEXT_LABEL: Partial<Record<StepId, string>> = { videos: 'Make my video' };

export default function Onboarding() {
  const [s, set] = useState<State>(initialState);
  const [toast, setToast] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const id = STEPS[s.step];
  const View = STEP_VIEWS[id];

  // Read the website shortly after the user stops typing a valid address.
  useEffect(() => {
    if (s.siteSt !== 'loading') return;
    const site = s.site;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onboarding/site?url=${encodeURIComponent(site)}`, { signal: ctrl.signal });
        const data: SiteInfo | { error: string } = await res.json();
        if (!res.ok || 'error' in data) throw new Error('error' in data ? data.error : `HTTP ${res.status}`);
        set(prev => finishSiteRead(prev, data));
      } catch {
        if (!ctrl.signal.aborted) set(prev => siteFailed(prev, site));
      }
    }, 500);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [s.siteSt, s.site]);

  // Load Bloom's real top videos from Oriane up front, so the videos step is ready when the user gets there.
  useEffect(() => {
    if (s.viralSt !== 'loading') return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/onboarding/videos', { signal: ctrl.signal });
        const data: { videos: ViralVideo[] } | { error: string } = await res.json();
        if (!res.ok || 'error' in data) throw new Error('error' in data ? data.error : `HTTP ${res.status}`);
        set(p => ({ ...p, viral: data.videos, viralSt: 'done' }));
      } catch {
        if (!ctrl.signal.aborted) set(p => ({ ...p, viralSt: 'error' }));
      }
    })();
    return () => ctrl.abort();
  }, [s.viralSt]);

  // Move focus to the new question so keyboard and screen-reader users land in the right place.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [s.step]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const next = () => {
    if (!canContinue(s)) return;
    set(p => ({ ...p, step: p.step + 1 }));
  };
  const back = () => (id === 'done' ? set(initialState()) : set(p => ({ ...p, step: Math.max(0, p.step - 1) })));
  const skip = () => set(p => (id === 'socials'
    ? withAutofill({ ...p, step: p.step + 1, links: { tiktok: '', instagram: '', youtube: '' }, found: [] })
    : { ...p, step: p.step + 1 }));

  const section = SECTION_OF[id];

  return (
    // data-onboarding scopes the focus and reduced-motion rules in globals.css to this page.
    <div data-onboarding className="w-full flex-1 bg-surface font-apple text-[15px] leading-normal text-ink">
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-9 px-6 pt-8 pb-16 max-sm:gap-6 max-sm:px-4 max-sm:pt-5">
      <div className="flex items-center gap-2.5 font-display text-[19px] font-semibold tracking-[-0.02em]">
        <span className="grid size-[30px] place-items-center rounded-[9px] bg-gradient-to-br from-[#5b6cff] to-accent text-white"><Icon name="play" size={14} stroke={0} /></span>
        HackTheFeed
      </div>

      <ol aria-label="Onboarding steps" className="mx-auto grid w-full max-w-[720px] grid-cols-4">
        {SECTIONS.map((name, i) => {
          const done = i < section || id === 'done';
          const now = i === section && id !== 'done';
          return (
            <li key={name} aria-current={now ? 'step' : undefined}
              className={cx('relative flex flex-col items-center gap-2.5 text-center text-[13.5px] max-sm:text-xs',
                'after:absolute after:top-2.5 after:left-[calc(50%+14px)] after:h-0.5 after:w-[calc(100%-28px)] last:after:hidden',
                done ? 'after:bg-accent' : 'after:bg-line', done || now ? 'font-medium text-ink' : 'text-ink-3')}>
              <span className={cx('relative z-10 grid size-[22px] place-items-center rounded-full border-[1.5px]',
                done ? 'border-accent bg-accent' : now ? 'border-accent bg-surface shadow-[0_0_0_4px_var(--color-accent-ring)]' : 'border-line bg-surface-2')}>
                <span className={cx('size-1.5 rounded-full', done ? 'bg-white' : now ? 'bg-accent' : 'bg-line')} />
              </span>
              {name}
            </li>
          );
        })}
      </ol>

      <section key={s.step} className="flex animate-enter flex-col items-center gap-7 pt-7 max-sm:gap-5 max-sm:pt-3">
        <h1 ref={heading} tabIndex={-1}
          className="max-w-[640px] text-center font-display text-[clamp(28px,3.6vw,38px)] leading-[1.15] font-light tracking-[-0.02em] text-balance outline-none">
          {TITLES[id](s)}
        </h1>
        <View s={s} set={set} toast={setToast} />
      </section>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={back} disabled={s.step === 0} className={cx(btn.ghost, 'max-sm:flex-1')}>
          {id === 'done' ? 'Start over' : <><Icon name="left" size={16} stroke={2} />Back</>}
        </button>
        {SKIPPABLE[id] && <button type="button" onClick={skip} className={btn.link}>{SKIPPABLE[id]}</button>}
        {id !== 'done' && (
          <button type="button" onClick={next} disabled={!canContinue(s)} className={cx(btn.primary, 'max-sm:flex-1')}>
            {NEXT_LABEL[id] ?? 'Continue'}
          </button>
        )}
      </div>
      {id !== 'done' && <p className="-mt-5 text-center text-[13px] text-ink-3">You can change any of this later in the Studio.</p>}

      <div role="status" aria-live="polite"
        className={cx('pointer-events-none fixed bottom-6 left-1/2 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-[10px] bg-ink px-[18px] py-3 text-sm text-surface transition',
          toast ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0')}>
        {toast}
      </div>
    </div>
    </div>
  );
}
