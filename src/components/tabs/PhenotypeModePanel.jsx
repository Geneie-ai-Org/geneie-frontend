import React, { useState } from 'react';
import { ChevronDown, PencilLine, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapse, Turn } from '@/components/motion';
import { cn } from '@/lib/utils';
import PhenotypeAiLabel from '@/components/PhenotypeAiLabel';
import { PHENOTYPE_FILTER_DESCRIPTION } from '@/lib/filterDisplayNames';
import { GhostPill, ModePill } from '@/components/tabs/ModeParts';

/**
 * Phenotype mode of the Variants sidebar. It shows what is saved on the sample (read-only: terms,
 * conditions, gene panels) and what running will do. Nothing here is invented: every term comes
 * from `sample_metadata.phenotype_hpo`. A term is "AI suggested" only when it came from the note
 * reader (`origin: note_phrase`); disease-annotation terms are conditions, anything else is the user's own.
 */

export function summarizePhenotype(meta) {
  const m = meta || {};
  const hpo = m.phenotype_hpo || {};
  const cands = Array.isArray(hpo.candidates) ? hpo.candidates.filter((c) => c && c.selected) : [];
  let terms = cands.map((c) => ({
    id: c.hpo_id,
    label: c.hpo_name || c.matched_phrase || c.hpo_id,
    kind: c.origin === 'note_phrase' ? 'ai' : c.origin === 'disease_annotation' ? 'condition' : 'user',
  }));
  if (terms.length === 0 && Array.isArray(hpo.confirmed_ids)) {
    terms = hpo.confirmed_ids.filter((id) => String(id || '').startsWith('HP:')).map((id) => ({ id, label: id, kind: 'user' }));
  }
  const diseases = (Array.isArray(hpo.disease_matches) && hpo.disease_matches.length ? hpo.disease_matches : hpo.disease_match ? [hpo.disease_match] : [])
    .map((d) => String(d?.name || '').trim())
    .filter(Boolean);
  const panels = (Array.isArray(m.selected_panels) ? m.selected_panels : [])
    .map((p) => String(p?.panel_name || p?.name || '').trim())
    .filter(Boolean);
  const genes = Array.isArray(m.selected_panel_gene_list) ? m.selected_panel_gene_list.length : 0;
  const text = String(m.phenotype_note_clean || m.phenotype || '').trim();
  return { terms, diseases, panels, genes, text };
}

function TermPill({ term }) {
  const ai = term.kind === 'ai';
  return (
    <li>
      <span
        title={term.id ? `${term.label} · ${term.id}` : term.label}
        className={cn(
          'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium',
          ai
            ? 'border-dashed border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-50))] text-[hsl(var(--brand-700))]'
            : 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]'
        )}
      >
        {ai ? <Sparkles aria-hidden className="size-3 shrink-0" /> : null}
        <span className="truncate">{term.label}</span>
        {ai ? <span className="sr-only"> (AI suggested)</span> : null}
      </span>
    </li>
  );
}

function Block({ title, count, children }) {
  return (
    <div className="space-y-1.5">
      <p className="m-0 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        {title}
        {count != null ? <span className="rounded-full bg-[hsl(var(--wb-pill))] px-1.5 text-[11px] tabular-nums text-foreground">{count}</span> : null}
      </p>
      {children}
    </div>
  );
}

/** What is saved on the sample, and the one way to change it. */
export function PhenotypeSummary({ meta, onEdit }) {
  const s = summarizePhenotype(meta);
  const [more, setMore] = useState(false);
  const FIRST = 8;
  const shown = s.terms.slice(0, FIRST);
  const rest = s.terms.slice(FIRST);
  const hasAi = s.terms.some((t) => t.kind === 'ai');
  const empty = s.terms.length === 0 && s.diseases.length === 0 && s.panels.length === 0;

  return (
    <section className="wb-card p-4" aria-label="Phenotype saved on this sample">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[14px] font-semibold text-foreground">Saved on this sample</h3>
        {onEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={onEdit} className="h-7 text-[12px] max-md:h-11">
            <PencilLine aria-hidden />
            Edit
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-3.5">
        {s.terms.length > 0 ? (
          <Block title="Findings used by the Phenotype run" count={s.terms.length}>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {shown.map((t) => <TermPill key={t.id || t.label} term={t} />)}
            </ul>
            {rest.length > 0 ? (
              <>
                <Collapse open={more} id="pheno-more-terms">
                  <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
                    {rest.map((t) => <TermPill key={t.id || t.label} term={t} />)}
                  </ul>
                </Collapse>
                <button
                  type="button"
                  aria-expanded={more}
                  aria-controls="pheno-more-terms"
                  onClick={() => setMore((v) => !v)}
                  className="-ml-1 inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none max-md:h-11"
                >
                  {more ? 'Show fewer' : `Show ${rest.length} more`}
                  <Turn open={more} deg={180}><ChevronDown aria-hidden className="size-3" /></Turn>
                </button>
              </>
            ) : null}
            {hasAi ? (
              <p className="m-0 flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
                <Sparkles aria-hidden className="mt-0.5 size-3 shrink-0 text-[hsl(var(--brand-700))]" />
                <span>Dashed pills were read from the clinical note by AI. Edit them in sample info.</span>
              </p>
            ) : null}
          </Block>
        ) : null}

        {s.diseases.length > 0 ? (
          <Block title="Conditions" count={s.diseases.length}>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {s.diseases.map((d) => (
                <li key={d}><span className="inline-flex h-7 max-w-full items-center rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-2.5 text-[12px] font-medium text-foreground"><span className="truncate">{d}</span></span></li>
              ))}
            </ul>
          </Block>
        ) : null}

        {s.panels.length > 0 ? (
          <Block title="Gene panels (boost the Triage ranking)" count={s.panels.length}>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {s.panels.map((p) => (
                <li key={p} className="flex items-center justify-between gap-2 rounded-2xl border border-[hsl(var(--wb-line))] px-3 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate text-foreground">{p}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">PanelApp</span>
                </li>
              ))}
            </ul>
            {s.genes > 0 ? <p className="m-0 text-[12px] tabular-nums text-muted-foreground">{s.genes.toLocaleString()} genes from the selected panels. They are used by Triage, not by the Phenotype run.</p> : null}
          </Block>
        ) : null}

        {empty && s.text ? (
          <Block title="Clinical note">
            <p className="m-0 line-clamp-4 text-[13px] leading-5 text-foreground">{s.text}</p>
            <p className="m-0 text-[12px] text-muted-foreground">No findings were picked from it yet. Edit the sample info to choose them.</p>
          </Block>
        ) : null}
      </div>
    </section>
  );
}

/** What pressing Run does, in order. The Run button itself lives in the sticky footer. */
export function PhenotypeNext() {
  const steps = [
    'Scores each variant against the findings above, with AI gene and variant scoring. Gene panels are not part of this run.',
    'Runs on the annotated file. It can take several minutes, and you can leave this tab open.',
    'The ranking becomes the active filter. You can remove it any time to see all variants again.',
  ];
  return (
    <section className="wb-card p-4" aria-label="What happens next">
      <h3 className="m-0 mb-2.5 text-[13px] font-semibold text-foreground">What happens next</h3>
      <ol className="m-0 list-none space-y-2.5 p-0">
        {steps.map((t, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-5 text-foreground">
            <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[11px] font-semibold tabular-nums text-[hsl(var(--brand-700))]">{i + 1}</span>
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Locked: nothing to rank by yet. A calm preview of the result, and the reason in one place. */
export function PhenotypeLockedPreview({ status, upgrade, canEdit }) {
  return (
    <section className="wb-card p-4" aria-label="Phenotype ranking is locked">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 flex items-center gap-1.5 text-[14px] font-semibold text-foreground"><PhenotypeAiLabel variant="heading" textClassName="text-[14px] font-semibold" /></h3>
          <p className="m-0 mt-1 text-[13px] leading-5 text-muted-foreground">{PHENOTYPE_FILTER_DESCRIPTION}</p>
        </div>
        <ModePill tone="muted">{status?.word || 'Locked'}</ModePill>
      </div>

      <div className="relative mt-3.5 overflow-hidden rounded-2xl border border-dashed border-[hsl(var(--wb-line-strong))] p-3">
        <span className="wb-chip absolute right-2.5 top-2.5">Preview</span>
        <div aria-hidden className="space-y-3 opacity-70 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
          <div className="space-y-1.5">
            <p className="m-0 text-[12px] font-medium text-muted-foreground">Findings</p>
            <div className="flex flex-wrap gap-1.5"><GhostPill w={84} /><GhostPill w={112} /><GhostPill w={70} /><GhostPill w={96} /></div>
          </div>
          <div className="space-y-1.5">
            <p className="m-0 text-[12px] font-medium text-muted-foreground">Gene panels</p>
            <GhostPill w={220} className="!block !h-8 !rounded-2xl" />
          </div>
          <div className="space-y-1.5">
            <p className="m-0 text-[12px] font-medium text-muted-foreground">Ranked variants</p>
            <div className="space-y-1.5">
              <GhostPill w={260} className="!block !h-3" />
              <GhostPill w={200} className="!block !h-3" />
              <GhostPill w={150} className="!block !h-3" />
            </div>
          </div>
        </div>
      </div>

      <p className="m-0 mt-3 text-[13px] leading-5 text-foreground">
        {upgrade
          ? 'Your plan does not include this run right now. Use the button below, then add a phenotype in sample info. Everything else on this page works without it.'
          : canEdit
            ? 'Add a phenotype in sample info to unlock this. Everything else on this page works without one.'
            : 'Add a phenotype description to the sample to unlock this. Everything else on this page works without one.'}
      </p>
    </section>
  );
}
