import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, ArrowUp, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dismissible, StageMark, StateButton } from '@/components/motion';
import { BouncyAccordion } from '@/components/motion/bouncy-accordion';
import { SharedLayoutBg } from '@/components/motion/shared-layout-bg';
import { TextReveal } from '@/components/motion/text-reveal';
import BrandLogo from '@/components/public/BrandLogo';
import Reveal from '@/components/public/Reveal';
import ProductTour from '@/components/public/ProductTour';
import WhoItsFor from '@/components/public/WhoItsFor';
import DrawsTheLine from '@/components/public/DrawsTheLine';
import PrinciplesSection from '@/components/public/PrinciplesSection';
import HeroGenome from '@/components/public/HeroGenome';
import HelixDivider from '@/components/public/HelixDivider';
import HalftoneWordmark from '@/components/public/HalftoneWordmark';
import { TiltCard } from '@/components/motion/tilt-card';
import ThemeToggle from '@/components/public/ThemeToggle';
import { useBetaSeats } from '@/hooks/useBetaSeats';
import { joinWaitlist } from '@/services/backendApi';
import { useSeo } from '@/hooks/useSeo';
import { acquireLenis, releaseLenis } from '@/lib/smoothScroll';

/* ------------------------------------------------------------------ content */

const PIPELINES = [
  ['Annotation', 'Functional consequence, population frequency and clinical significance, added with ANNOVAR.'],
  ['ACMG classification', 'ClinVar or InterVar classification together with gnomAD allele frequency.'],
  ['Phenotype ranking', 'HPO terms from the clinical picture, ranked for germline candidates with Exomiser.'],
  ['Filters and exports', 'Saved filters you can reopen and undo, and variant tables exported to Excel.'],
];

const MODEL = [
  ['Reads your question', 'Turns “which are rare and pathogenic?” into filters and lookups on your file.'],
  ['Explains what it finds', 'Describes the rows that come back, tied to the underlying data, and says when the file cannot answer.'],
  ['Never scores', 'It does not classify, score or rank variants. Those results come only from the pipelines.', 'no'],
];

const FAQS = [
  {
    q: 'Is Geneie intended for clinical or research use?',
    a: 'It is designed to support both research and clinical workflows. It is a decision-support tool, not a diagnostic device. Results should be interpreted by qualified professionals within the appropriate clinical or scientific context.',
  },
  {
    q: 'Can I filter variants by a patient’s symptoms?',
    a: 'Yes. Describe the phenotype in natural language. Geneie derives HPO terms and uses Exomiser for phenotype-driven prioritization of germline variants. This needs an annotated file.',
  },
  {
    q: 'Could the AI invent variant classifications?',
    a: 'The language model is limited to translating your question into filter and lookup operations. Variant scoring, classification and filtering are executed by deterministic bioinformatics pipelines (ANNOVAR, ACMG criteria, Exomiser), so each result can be traced to the data.',
  },
  {
    q: 'Can I export results for reports or publications?',
    a: 'Yes. Results appear as interpretable tables. You can copy insights or export customised variant tables to Excel.',
  },
  {
    q: 'How is my data handled?',
    a: 'Application data is stored in AWS Mumbai (ap-south-1) and encrypted in transit with TLS. Prompts and derived text sent to language-model or literature tools may leave India. During the closed beta, upload de-identified or synthetic data unless you have a written agreement with us that allows otherwise. The Privacy Policy has the full detail.',
  },
  {
    q: 'How do I get access?',
    a: 'Geneie is in closed beta. Request access with your email and we will set up your seat and get in touch.',
  },
];

// Both accordions are collapsed on load, so their answers are easy for a crawler
// to miss. FAQPage schema states them outright and makes the page eligible for
// FAQ rich results.
const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const NAV = [
  { label: 'How it works', target: 'how-it-works' },
  { label: 'Capabilities', target: 'capabilities' },
  { label: 'FAQ', target: 'faq' },
];

/* ---------------------------------------------------------- access request */

/** What to tell someone after they submit. A repeat submit gets its own line. */
function confirmationFor(result, isFull) {
  if (result?.alreadyApplied) {
    if (result.status === 'invited' || result.status === 'contacted') {
      return "You've already requested a seat and we've been in touch. Check your inbox, including spam.";
    }
    return "You've already requested a seat with this email. You're on the list and we'll come back to you.";
  }
  return isFull
    ? "You're on the waitlist. We'll be in touch as soon as a seat opens."
    : "You're on the list. We'll be in touch once your beta seat is ready.";
}

/**
 * Closed beta: nobody self-serves an account, so the one call to action is a request for a
 * seat. A repeat email is a success rather than an error on the backend, so a second submit
 * shows the same confirmation instead of leaking whether an address is already listed.
 */
function AccessRequest({ seats, source, idPrefix }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(null);
  const [error, setError] = useState('');
  const [lastError, setLastError] = useState('');
  const [trap, setTrap] = useState(''); // honeypot; humans never see it

  const isFull = Boolean(seats) && !seats.open;
  const inputId = `${idPrefix}-email`;

  const fail = (msg) => {
    setError(msg);
    if (msg) setLastError(msg);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || joined) return;
    if (trap) {
      // A bot filled the hidden field. Show the success state and write nothing.
      setJoined(true);
      return;
    }
    if (!email.trim()) {
      fail('Enter your email so we can reach you.');
      return;
    }
    fail('');
    setSubmitting(true);
    try {
      const result = await joinWaitlist({ email: email.trim(), source });
      setJoined(result);
      toast.success(confirmationFor(result, isFull));
    } catch (err) {
      fail(err.message || 'We could not submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (joined) {
    return (
      <div
        role="status"
        className="wb-rise flex max-w-md items-start gap-3 rounded-2xl border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))] px-4 py-3 text-sm leading-6 text-foreground"
      >
        <StageMark state="done" size={22} className="mt-0.5 shrink-0" />
        <span>{confirmationFor(joined, isFull)}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className="px-1 text-[13px] font-medium text-muted-foreground">
          Work email
        </label>
        {/* One pill: the field and its action share an edge, and the whole pill takes the focus ring. */}
        <div
          data-invalid={error ? 'true' : undefined}
          className="mt-2 flex items-center gap-2 rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] p-1 pl-4 transition-[border-color,box-shadow] duration-150 focus-within:border-[hsl(var(--brand-500))] focus-within:shadow-[0_0_0_3px_hsl(var(--brand-300)/0.45)] data-[invalid=true]:border-[var(--error)]"
        >
          <Input
            id={inputId}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@lab.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
            className="h-11 min-w-0 flex-1 !rounded-none !border-0 !bg-transparent px-0 text-base !shadow-none !outline-none !ring-0 sm:h-9 sm:text-sm"
          />
          {/* Honeypot: off-screen and hidden from assistive tech, so only a bot fills it. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
            className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
          />
          <StateButton
            type="submit"
            state={submitting ? 'running' : 'idle'}
            labels={{ idle: isFull ? 'Join waitlist' : 'Request access', running: 'Sending…' }}
            icon={ArrowRight}
            hoverTurn
            className={`h-11 shrink-0 px-4 text-sm font-medium sm:h-9 ${submitting ? 'disabled:opacity-100' : ''}`}
          />
        </div>
        <Dismissible show={Boolean(error)}>
          <p id={`${inputId}-error`} role="alert" className="px-1 pt-2 text-sm text-[var(--error)]">
            {error || lastError}
          </p>
        </Dismissible>
        {!error && (
          <p id={`${inputId}-hint`} className="mt-2 px-1 text-[13px] leading-5 text-muted-foreground">
            {seats?.total
              ? seats.remaining > 0
                ? `${seats.remaining} of ${seats.total} beta seats left. `
                : `All ${seats.total} beta seats are taken right now. `
              : ''}
            Closed beta. We set up each seat by hand and email you.
          </p>
        )}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------ product mock */

/** Static, illustrative preview of the product. Labelled as synthetic so it reads as a sample. */
function ProductPreview() {
  const rows = [
    { gene: 'SCN1A', variant: 'c.664C>T', cls: 'Pathogenic' },
    { gene: 'KCNQ2', variant: 'c.1342G>A', cls: 'Likely pathogenic' },
    { gene: 'STXBP1', variant: 'c.902+1G>A', cls: 'Pathogenic' },
  ];
  return (
    <figure className="relative w-full" aria-label="Illustrative example of a Geneie conversation">
      <div className="wb-rise" style={{ animationDelay: `${HERO_AT.frame}ms` }}>
      <p className="mb-2 px-1 text-right text-[13px] leading-5 text-[var(--text-tertiary)]">Synthetic data</p>
      <div className="relative">
        <span aria-hidden="true" className="pub-sheet pub-sheet--2 hidden sm:block" />
        <span aria-hidden="true" className="pub-sheet pub-sheet--1 hidden sm:block" />
      <div className="wb-card pub-card relative overflow-hidden" style={CARD_R}>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="wb-rise flex justify-end" style={{ animationDelay: `${HERO_AT.bubble}ms` }}>
            <div className="chat-user-bubble">Which pathogenic variants fit infantile-onset seizures?</div>
          </div>
          <div className="space-y-3">
            <p className="wb-rise text-[0.9375rem] leading-[1.65]" style={{ animationDelay: `${HERO_AT.answer}ms`, color: 'var(--text-primary)' }}>
              Filtered 1,284 annotated variants to <strong className="font-semibold">3 candidates</strong>:
              ClinVar pathogenic or likely pathogenic, gnomAD allele frequency below 0.01, ranked against the HPO terms for the phenotype.
            </p>
            <div className="wb-rise overflow-x-auto rounded-2xl border border-[hsl(var(--wb-line))]" style={{ animationDelay: `${HERO_AT.rows}ms` }}>
              <table className="w-full min-w-[19rem] text-left text-[0.8125rem]">
                <thead className="bg-[hsl(var(--wb-pill))] text-[13px] text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Gene</th>
                    <th scope="col" className="px-3 py-2 font-medium">Variant</th>
                    <th scope="col" className="px-3 py-2 font-medium">ClinVar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.gene} className="wb-rise border-t border-[hsl(var(--wb-line))]" style={{ animationDelay: `${HERO_AT.rows + 150 + i * 70}ms` }}>
                      <td className="px-3 py-2 font-medium">{r.gene}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.variant}</td>
                      <td className="px-3 py-2"><span className="wb-chip" data-tone="brand">{r.cls}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="wb-rise pipeline-composer [&&&]:!shadow-none flex items-center gap-2 py-2 pl-4 pr-2" style={{ animationDelay: `${HERO_AT.composer}ms` }} aria-hidden="true" inert>
            <span className="min-w-0 flex-1 truncate text-[15px] leading-6 text-muted-foreground">Ask about your variants</span>
            <span className="chat-tool chat-tool-send"><ArrowUp className="chat-send-arrow" /></span>
          </div>
        </div>
      </div>
      </div>
      <HeroGenome className="mt-9 hidden h-auto w-full sm:block" />
      </div>
    </figure>
  );
}

/* --------------------------------------------------------------------- FAQ */

/** Accordion rows: the answer opens with a height + fade, the chevron turns. Several can be open. */
/** Tick for what a side does, cross for what it never does. Shape and colour both differ, so it reads without colour. */
function Mark({ no = false }) {
  const Icon = no ? X : Check;
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: no ? 'hsl(var(--foreground))' : 'hsl(var(--brand-solid))', color: no ? 'hsl(var(--background))' : 'hsl(var(--primary-foreground))' }}
    >
      <Icon className="size-3" strokeWidth={3} />
    </span>
  );
}

const FAQ_ITEMS = FAQS.map((item, i) => ({ id: `q${i}`, title: item.q, description: item.a }));

const FAQ_CLASSES = {
  item: 'wb-card pub-card !bg-[hsl(var(--wb-card))]',
  trigger: 'focus-visible:bg-transparent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--brand-500))]',
  title: 'whitespace-normal py-3.5 text-base leading-6 lg:text-xl lg:leading-7',
  description: 'pr-5 text-base leading-6',
};

/* From lg up the list reserves the height of its tallest open state, so opening a question never moves the
 * divider and sections below it. The reservation is invisible copies of the list, one per question with that
 * question open, stacked in the same grid cell as the real list: the cell is as tall as the tallest copy,
 * whatever the width or copy. Below lg the page just flows. */
function FaqList() {
  return (
    <div className="lg:grid lg:items-start">
      <div className="lg:col-start-1 lg:row-start-1">
        <BouncyAccordion items={FAQ_ITEMS} classNames={FAQ_CLASSES} />
      </div>
      {FAQ_ITEMS.map((item) => (
        <div key={item.id} aria-hidden="true" inert className="pointer-events-none invisible hidden lg:col-start-1 lg:row-start-1 lg:block">
          <BouncyAccordion items={FAQ_ITEMS} value={item.id} onValueChange={() => {}} classNames={FAQ_CLASSES} />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- page */

/* Hero entrance order, in ms after load: headline, subtext, form, then the empty preview box, then its text (bubble, answer, rows). */
const HERO_AT = { sub: 550, form: 700, frame: 1000, bubble: 1250, answer: 1450, rows: 1600, composer: 2150 };
// Body copy follows its heading by this much when a section scrolls in.
const BODY_LAG = 90;

const SECTION = 'mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 sm:py-20 lg:py-24';
// Bands that hang a 28px ruler from their top edge need less top padding, so the gap to the heading matches the others.
const SECTION_RULED = `${SECTION} !pt-10 sm:!pt-12 lg:!pt-16`;
// Type scale follows docs/MISTRAL_TYPE_SCALE.md: one step at lg, body fixed at 16/24.
const H2 = 'text-2xl font-medium leading-7 tracking-[-0.01em] text-balance lg:text-[2.75rem] lg:leading-[3.25rem]';
const CARD_R = { borderRadius: 20 };
// The gliding pill in SharedLayoutBg is the only hover surface, so .wb-tab's own hover fill and border are switched off.
const NAV_PILL = 'wb-tab !hidden !border-transparent hover:!bg-transparent px-3.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] md:!flex';
const FOOT_LINK = 'inline-flex min-h-11 items-center rounded-full px-3 py-2 sm:min-h-0 text-muted-foreground transition-colors hover:bg-[hsl(var(--wb-pill))] hover:text-foreground';

const LandingPage = () => {
  useSeo({
    title: 'Geneie — Chat with Your Genomic Data | AI Variant Analysis',
    description:
      'Upload a VCF and explore your variants in plain language. Geneie pairs clinical annotation, ACMG classification and phenotype-driven AI prioritization with chat.',
    path: '/',
  });
  const navigate = useNavigate();
  /* Closed beta: nobody self-serves an account. The CTA is an application form; a seat is
   * granted from /admin-haha. The seat count is shown as context when it is known, and
   * simply omitted when the call is slow or fails. */
  const { seats } = useBetaSeats();

  const lenisRef = useRef(null);
  useEffect(() => {
    lenisRef.current = acquireLenis();
    return () => {
      if (lenisRef.current) releaseLenis();
      lenisRef.current = null;
    };
  }, []);

  const scrollTo = (e, target) => {
    e.preventDefault();
    const el = document.getElementById(target);
    if (!el) return;
    // Lenis owns scrolling when it is running; its stylesheet switches native smooth scrolling off.
    if (lenisRef.current) {
      lenisRef.current.scrollTo(el, { offset: -56 }); // the sticky header, as scroll-mt-14 does for native scrolling
      return;
    }
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
      <div className="wb-scope pub-scope min-h-dvh font-sans text-foreground">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-[hsl(var(--wb-card))] px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>

        {/* ------------------------------------------------------------- nav */}
        <header className="pub-header sticky top-0 z-40 border-b border-[hsl(var(--wb-line))]">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
            <Link to="/" aria-label="Geneie home" className="inline-flex min-h-11 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] sm:min-h-0">
              <BrandLogo className="h-8 w-auto" />
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-1">
              <SharedLayoutBg
                inset={0}
                className="hidden w-auto flex-row gap-1 md:flex"
                pillClassName="rounded-full bg-[hsl(var(--wb-pill))]"
              >
                {NAV.map((item) => (
                  <a
                    key={item.target}
                    href={`#${item.target}`}
                    onClick={(e) => scrollTo(e, item.target)}
                    className={NAV_PILL}
                  >
                    {item.label}
                  </a>
                ))}
              </SharedLayoutBg>
              <ThemeToggle className="ml-1" />
              <Button
                type="button"
                variant="outline"
                className="ml-1 h-11 px-4 text-sm font-medium sm:h-9"
                onClick={() => navigate('/auth')}
              >
                Log in
              </Button>
            </nav>
          </div>
        </header>

        <main id="main">
          {/* ------------------------------------------------------------ hero */}
          <div className="pub-hero" style={{ backgroundImage: 'radial-gradient(ellipse 60% 70% at 82% 30%, hsl(var(--brand-300) / 0.28), transparent 70%), radial-gradient(ellipse 45% 55% at 8% 0%, hsl(var(--brand-200) / 0.35), transparent 70%), linear-gradient(to bottom, var(--pub-tint) 0%, var(--pub-tint) 55%, var(--pub-plain) 100%)' }}>
          <section aria-labelledby="hero-title" className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-5 py-20 sm:px-8 lg:px-10 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16 lg:pb-16 lg:pt-24">
            <div>
              <TextReveal
                as="h1"
                id="hero-title"
                text="From VCF to ranked variants you can question."
                stagger={0.045}
                blur={8}
                yOffset="30%"
                delay={0.05}
                className="max-w-xl text-[2.5rem] font-medium leading-[3rem] tracking-[-0.02em] text-balance lg:text-[4rem] lg:leading-[4.25rem]"
              />
              <p className="wb-rise mt-5 max-w-xl text-base leading-6 text-muted-foreground" style={{ animationDelay: `${HERO_AT.sub}ms` }}>
                Upload a whole-genome or exome file. Geneie annotates it, applies ACMG and phenotype-driven
                filters in deterministic pipelines, and lets you ask questions about the result in plain language.
              </p>
              <div className="wb-rise mt-8" style={{ animationDelay: `${HERO_AT.form}ms` }}>
                <AccessRequest seats={seats} source="landing-hero" idPrefix="hero" />
              </div>
            </div>
            <ProductPreview />
          </section>
          <HelixDivider />
          </div>

          {/* ---------------------------------------------------- how it works */}
          <div className="pub-band">
          <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-14">
            <div className={SECTION}>
              <Reveal className="mb-2">
                <h2 id="how-title" className={H2}>From a raw file to answers you can cite</h2>
              </Reveal>
              <Reveal delay={BODY_LAG}>
                <ProductTour />
              </Reveal>
            </div>
          </section>
          </div>

          {/* ------------------------------------------------------- who it's for */}
          <div className="pub-band">
          <section id="who-its-for" aria-labelledby="who-title" className="scroll-mt-14">
            <div className={SECTION}>
              <Reveal className="mb-8 lg:mb-12">
                <h2 id="who-title" className={H2}>Who it’s for</h2>
              </Reveal>
              {/* Not wrapped in Reveal: it is several screens tall, so its visibility threshold would never be met reliably. */}
              <WhoItsFor />
            </div>
          </section>
          </div>

          {/* ------------------------------------------------------ capabilities */}
          <div className="pub-band pub-band--tint">
          <div aria-hidden="true" className="pub-rule tx tx--ticks" />
          <section id="capabilities" aria-labelledby="cap-title" className="scroll-mt-14">
            <div className={SECTION_RULED}>
              <Reveal>
                <h2 id="cap-title" className={H2}>What the model does, and what it does not</h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                  The pipelines do the scoring and classifying. The language model reads your question and explains what comes back, so every result traces to your data.
                </p>
              </Reveal>
              <div className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <Reveal delay={BODY_LAG} className="wb-card pub-card p-5 sm:p-6" style={CARD_R}>
                  <h3 className="text-xl font-medium leading-6 lg:text-2xl lg:leading-8">Runs in established pipelines</h3>
                  <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                    {PIPELINES.map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-base font-medium leading-6">{k}</dt>
                        <dd className="mt-1 text-base leading-6 text-muted-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
                <Reveal delay={BODY_LAG + 60} className="wb-card pub-card p-5 sm:p-6" style={{ ...CARD_R, borderColor: 'hsl(var(--brand-300))' }}>
                  <h3 className="text-xl font-medium leading-6 lg:text-2xl lg:leading-8">The language model</h3>
                  <dl className="mt-4 space-y-5">
                    {MODEL.map(([k, v, no]) => (
                      <div key={k}>
                        <dt className="flex items-center gap-2 text-base font-medium leading-6"><Mark no={Boolean(no)} />{k}</dt>
                        <dd className="mt-1 text-base leading-6 text-muted-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
              </div>
            </div>
          </section>
          </div>

          {/* ------------------------------------------------ where Geneie draws the line */}
          <div className="pub-band">
          <div aria-hidden="true" className="pub-rule tx tx--ticks" />
          <section aria-labelledby="line-title">
            <div className={SECTION_RULED}>
              <Reveal>
                <h2 id="line-title" className={H2}>Where Geneie draws the line</h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">Decisions we made on purpose.</p>
              </Reveal>
              <div className="mt-10 lg:mt-14">
                <DrawsTheLine />
              </div>
            </div>
          </section>
          </div>

          {/* ------------------------------------------------------ built to be checked */}
          <div className="pub-band pub-band--tint">
          <div aria-hidden="true" className="pub-rule tx tx--ticks" />
          <section aria-labelledby="checked-title">
            <div className={SECTION_RULED}>
              <Reveal>
                <h2 id="checked-title" className={H2}>Built to be checked</h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">Three properties you can verify yourself.</p>
              </Reveal>
              <div className="mt-10 lg:mt-14">
                <PrinciplesSection />
              </div>
            </div>
          </section>
          </div>

          {/* ---------------------------------------------------- data handling */}
          <div className="pub-band">
          <div aria-hidden="true" className="pub-rule tx tx--ticks" />
          <section aria-labelledby="data-title">
            <div className={SECTION_RULED}>
              <Reveal>
                <h2 id="data-title" className={H2}>Data handling</h2>
                <p className="mt-3 text-muted-foreground">
                  Read the{' '}
                  <Link to="/legal/privacy" className="text-[hsl(var(--brand-700))] underline underline-offset-2">Privacy Policy</Link>{' '}
                  and{' '}
                  <Link to="/legal/terms" className="text-[hsl(var(--brand-700))] underline underline-offset-2">Terms of Use</Link>.
                </p>
              </Reveal>
              <div className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-3">
                {[
                  ['Closed beta', 'Use de-identified or synthetic data. Identifiable patient data needs a separate written agreement.'],
                  ['Where data lives', 'Application data is stored in AWS Mumbai (ap-south-1) and encrypted in transit.'],
                  ['AI processing', 'Prompts and derived text sent to language-model or literature tools may be processed outside India.'],
                ].map(([k, v], i) => (
                  <Reveal key={k} delay={BODY_LAG + i * 60} className="h-full">
                    <TiltCard max={6} className="wb-card pub-card h-full rounded-[20px] p-5 sm:p-6">
                      <h3 className="text-xl font-medium leading-6 lg:text-2xl lg:leading-8">{k}</h3>
                      <p className="mt-2 text-base leading-6 text-muted-foreground">{v}</p>
                    </TiltCard>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
          </div>

          {/* ------------------------------------------------------------- FAQ */}
          <div className="pub-band pub-band--tint">
          <div aria-hidden="true" className="pub-rule tx tx--ticks" />
          <section id="faq" aria-labelledby="faq-title" className="scroll-mt-14">
            <div className={`${SECTION_RULED} grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
              <Reveal>
                <h2 id="faq-title" className={H2}>Questions</h2>
              </Reveal>
              <Reveal delay={BODY_LAG}>
                <FaqList />
              </Reveal>
            </div>
          </section>
          </div>

          {/* -------------------------------------------------------- closing CTA */}
          <div className="pub-band">
          <div aria-hidden="true" className="pub-rule tx tx--ticks" />
          <section aria-labelledby="cta-title">
            <div className={SECTION_RULED}>
              <Reveal className="wb-card pub-card pub-cta px-6 py-12 sm:px-12 sm:py-16" style={CARD_R}>
                <h2 id="cta-title" className={`max-w-2xl ${H2}`}>
                  Try Geneie on your own variant file.
                </h2>
                <Reveal delay={BODY_LAG} className="mt-6">
                  <AccessRequest seats={seats} source="landing-pricing" idPrefix="cta" />
                </Reveal>
              </Reveal>
            </div>
          </section>
          </div>
        </main>

        {/* ---------------------------------------------------------- footer */}
        <footer id="contact" className="pub-band pub-band--deep">
          <div aria-hidden="true" className="pub-rule tx tx--ticks" />
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 py-12 sm:px-8 lg:px-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xs">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Geneie by Omixir</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Ask your variant file questions in plain language. Geneie supports your decisions; it does not diagnose.
              </p>
            </div>
            <nav aria-label="Footer" className="-ml-3 flex gap-x-10 text-sm md:ml-0">
              <div>
                <h3 className="px-3 text-xs font-normal uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Product</h3>
                <ul className="mt-2 flex flex-col">
                  <li><a href="#how-it-works" className={FOOT_LINK}>How it works</a></li>
                  <li><a href="#capabilities" className={FOOT_LINK}>Capabilities</a></li>
                  <li><a href="#faq" className={FOOT_LINK}>FAQ</a></li>
                </ul>
              </div>
              <div>
                <h3 className="px-3 text-xs font-normal uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Legal</h3>
                <ul className="mt-2 flex flex-col">
                  <li><Link to="/legal/terms" className={FOOT_LINK}>Terms of Use</Link></li>
                  <li><Link to="/legal/privacy" className={FOOT_LINK}>Privacy Policy</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="px-3 text-xs font-normal uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Contact</h3>
                <ul className="mt-2 flex flex-col">
                  <li><a href="mailto:support@geneie.chat" className={FOOT_LINK}>support@geneie.chat</a></li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--wb-line))] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-[var(--text-tertiary)] sm:px-8 lg:px-10 sm:py-5">
            <span>&copy; {new Date().getFullYear()} Geneie</span>
            <a
              href="https://omixir.com/"
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-1.5 hover:text-foreground sm:min-h-0"
            >
              Powered by Omixir
            </a>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
              className="inline-flex min-h-11 items-center gap-1.5 hover:text-foreground sm:min-h-0"
            >
              Back to top <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-hidden px-2 sm:px-4">
            <HalftoneWordmark text="Geneie" />
          </div>
        </footer>
      </div>
    </>
  );
};

export default LandingPage;
