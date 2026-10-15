import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  Dna,
  FileUp,
  Filter,
  Loader2,
  MessageSquareText,
  ScanSearch,
  ShieldCheck,
  Sheet,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import BrandLogo from '@/components/public/BrandLogo';
import { useBetaSeats } from '@/hooks/useBetaSeats';
import { joinWaitlist } from '@/services/backendApi';
import { useSeo } from '@/hooks/useSeo';

/* ------------------------------------------------------------------ content */

const STEPS = [
  {
    icon: FileUp,
    title: 'Upload a variant file',
    body: 'Start from a whole-genome or whole-exome VCF. Tabular variant exports can be converted to VCF in the app. Geneie checks the file for the columns each step needs and tells you what is missing.',
  },
  {
    icon: Filter,
    title: 'Annotate and filter',
    body: 'Unannotated files are annotated with ANNOVAR. Then narrow the set with ACMG classification (ClinVar or InterVar plus gnomAD frequency) or phenotype-driven ranking with Exomiser.',
  },
  {
    icon: MessageSquareText,
    title: 'Ask and export',
    body: 'Ask questions about the filtered variants in plain language and get answers tied to the underlying rows. Copy insights or export a variant table for your report.',
  },
];

const CAPABILITIES = [
  {
    icon: Dna,
    title: 'Annotation',
    body: 'Functional consequence, population frequency and clinical significance added with ANNOVAR.',
  },
  {
    icon: ShieldCheck,
    title: 'ACMG classification',
    body: 'Filter by ClinVar or InterVar classification together with gnomAD allele frequency.',
  },
  {
    icon: Stethoscope,
    title: 'Phenotype-driven ranking',
    body: 'Describe the clinical picture in free text. HPO terms are derived and Exomiser ranks germline candidates.',
  },
  {
    icon: ScanSearch,
    title: 'Deterministic by design',
    body: 'The language model translates your question into filters and lookups. Scoring and classification run in established pipelines, not in the model.',
  },
  {
    icon: MessageSquareText,
    title: 'Plain-language questions',
    body: 'Ask about genes, consequences, inheritance or frequency without writing a query.',
  },
  {
    icon: Sheet,
    title: 'Export for reports',
    body: 'Copy insights or export filtered variant tables to Excel for clinical reports and publications.',
  },
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
function AccessRequest({ seats, source, onSignIn, idPrefix }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(null);
  const [error, setError] = useState('');
  const [trap, setTrap] = useState(''); // honeypot; humans never see it

  const isFull = Boolean(seats) && !seats.open;
  const inputId = `${idPrefix}-email`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || joined) return;
    if (trap) {
      // A bot filled the hidden field. Show the success state and write nothing.
      setJoined(true);
      return;
    }
    if (!email.trim()) {
      setError('Enter your email so we can reach you.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await joinWaitlist({ email: email.trim(), source });
      setJoined(result);
      toast.success(confirmationFor(result, isFull));
    } catch (err) {
      setError(err.message || 'We could not submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (joined) {
    return (
      <div role="status" className="max-w-md rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm leading-6 text-foreground">
        {confirmationFor(joined, isFull)}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className="text-sm font-medium">
          {isFull ? 'Join the waitlist' : 'Request beta access'}
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
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
            className="h-11 flex-1 px-3 text-base sm:text-sm"
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
          <Button type="submit" disabled={submitting} className="h-11 px-5 text-sm font-medium">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…
              </>
            ) : isFull ? (
              'Join waitlist'
            ) : (
              <>
                Request access <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="mt-2 text-sm text-[var(--error)]">
            {error}
          </p>
        ) : (
          <p id={`${inputId}-hint`} className="mt-2 text-xs leading-5 text-muted-foreground">
            {seats?.total
              ? seats.remaining > 0
                ? `${seats.remaining} of ${seats.total} beta seats left. `
                : `All ${seats.total} beta seats are taken right now. `
              : ''}
            Closed beta. We set up each seat by hand and email you.
          </p>
        )}
      </form>
      <button
        type="button"
        onClick={onSignIn}
        className="mt-3 inline-flex min-h-11 items-center rounded-md text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Already have an account? Log in
      </button>
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
    <figure className="w-full" aria-label="Illustrative example of a Geneie conversation">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--elevation-md)]">
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">Example conversation</span>
          <span className="text-xs text-[var(--text-tertiary)]">Synthetic data</span>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex justify-end">
            <p className="max-w-[88%] rounded-xl rounded-br-sm bg-muted px-3.5 py-2.5 text-sm leading-5">
              Which pathogenic variants fit infantile-onset seizures?
            </p>
          </div>
          <div className="space-y-3 text-sm leading-6">
            <p className="text-muted-foreground">
              Filtered 1,284 annotated variants to <span className="font-medium text-foreground">3 candidates</span>:
              ClinVar pathogenic or likely pathogenic, gnomAD allele frequency below 0.01, ranked against the HPO terms for the phenotype.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[19rem] text-left text-[0.8125rem]">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Gene</th>
                    <th scope="col" className="px-3 py-2 font-medium">Variant</th>
                    <th scope="col" className="px-3 py-2 font-medium">ClinVar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.gene} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{r.gene}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.variant}</td>
                      <td className="px-3 py-2">{r.cls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-[var(--text-tertiary)]">
        Illustration only. Not a real case.
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------------- page */

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

  const scrollTo = (e, target) => {
    e.preventDefault();
    const el = document.getElementById(target);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
      <div className="min-h-dvh bg-background font-sans text-foreground">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>

        {/* ------------------------------------------------------------- nav */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
            <Link to="/" aria-label="Geneie home" className="inline-flex rounded-md">
              <BrandLogo className="h-8 w-auto" />
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-1">
              {NAV.map((item) => (
                <a
                  key={item.target}
                  href={`#${item.target}`}
                  onClick={(e) => scrollTo(e, item.target)}
                  className="hidden h-9 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
                >
                  {item.label}
                </a>
              ))}
              <Button
                type="button"
                variant="outline"
                className="ml-1 h-10 px-4 text-sm font-medium md:h-9"
                onClick={() => navigate('/auth')}
              >
                Log in
              </Button>
            </nav>
          </div>
        </header>

        <main id="main">
          {/* ------------------------------------------------------------ hero */}
          <section aria-labelledby="hero-title" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:pb-24 lg:pt-24">
            <div>
              <p className="text-sm font-medium text-primary">Clinical genomics, in conversation</p>
              <h1 id="hero-title" className="mt-4 max-w-xl text-[2.25rem] font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
                From VCF to ranked variants you can question.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Upload a whole-genome or exome file. Geneie annotates it, applies ACMG and phenotype-driven
                filters in deterministic pipelines, and lets you ask questions about the result in plain language.
              </p>
              <div className="mt-8">
                <AccessRequest seats={seats} source="landing-hero" idPrefix="hero" onSignIn={() => navigate('/auth')} />
              </div>
              <p className="mt-8 text-sm text-muted-foreground">
                For clinicians, researchers, genetic counselors and bioinformaticians working with WGS and WES data.
              </p>
            </div>
            <ProductPreview />
          </section>

          {/* ---------------------------------------------------- how it works */}
          <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-14 border-t border-border">
            <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
              <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">Three steps from a raw file to answers you can cite.</p>
              <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
                {STEPS.map((step, i) => (
                  <li key={step.title}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm font-medium tabular-nums">
                        {i + 1}
                      </span>
                      <step.icon className="h-5 w-5 text-primary" aria-hidden="true" strokeWidth={1.75} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ------------------------------------------------------ capabilities */}
          <section id="capabilities" aria-labelledby="cap-title" className="scroll-mt-14 border-t border-border bg-[var(--bg-surface-sunken)]">
            <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
              <h2 id="cap-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">What you get</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Established tools for the analysis, a language interface for the questions.
              </p>
              <ul className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                {CAPABILITIES.map((c) => (
                  <li key={c.title} className="flex gap-3.5">
                    <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" strokeWidth={1.75} />
                    <div>
                      <h3 className="text-base font-semibold">{c.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ---------------------------------------------------- data handling */}
          <section aria-labelledby="data-title" className="border-t border-border">
            <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:py-20">
              <div>
                <h2 id="data-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Data handling</h2>
                <p className="mt-2 text-muted-foreground">What to know before you upload.</p>
              </div>
              <dl className="divide-y divide-border border-y border-border text-sm">
                {[
                  ['Closed beta', 'Use de-identified or synthetic data. Identifiable patient data needs a separate written agreement.'],
                  ['Where data lives', 'Application data is stored in AWS Mumbai (ap-south-1) and encrypted in transit.'],
                  ['AI processing', 'Prompts and derived text sent to language-model or literature tools may be processed outside India.'],
                ].map(([k, v]) => (
                  <div key={k} className="grid gap-1 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
                    <dt className="font-medium">{k}</dt>
                    <dd className="leading-6 text-muted-foreground">{v}</dd>
                  </div>
                ))}
                <div className="py-4 text-muted-foreground">
                  Read the{' '}
                  <Link to="/legal/privacy" className="text-primary underline underline-offset-2">Privacy Policy</Link>{' '}
                  and{' '}
                  <Link to="/legal/terms" className="text-primary underline underline-offset-2">Terms of Use</Link>.
                </div>
              </dl>
            </div>
          </section>

          {/* ------------------------------------------------------------- FAQ */}
          <section id="faq" aria-labelledby="faq-title" className="scroll-mt-14 border-t border-border bg-[var(--bg-surface-sunken)]">
            <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:py-20">
              <h2 id="faq-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Questions</h2>
              <Accordion defaultValue={[]} className="w-full border-y border-border">
                {FAQS.map((item, i) => (
                  <AccordionItem key={item.q} value={`faq-${i}`}>
                    <AccordionTrigger className="min-h-11 items-center gap-4 py-3.5 text-[0.9375rem] font-medium hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 pr-8 text-sm leading-6 text-muted-foreground">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          {/* -------------------------------------------------------- closing CTA */}
          <section aria-labelledby="cta-title" className="border-t border-border">
            <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
              <h2 id="cta-title" className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Try Geneie on your own variant file.
              </h2>
              <div className="mt-6">
                <AccessRequest seats={seats} source="landing-pricing" idPrefix="cta" onSignIn={() => navigate('/auth')} />
              </div>
            </div>
          </section>
        </main>

        {/* ---------------------------------------------------------- footer */}
        <footer id="contact" className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xs">
              <BrandLogo className="h-8 w-auto" />
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Genomic variant analysis for researchers and clinicians. A decision-support tool, not a diagnostic device.
              </p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-1 text-sm sm:grid-cols-3">
              <Link to="/legal/terms" className="py-2 text-muted-foreground hover:text-foreground hover:underline">Terms of Use</Link>
              <Link to="/legal/privacy" className="py-2 text-muted-foreground hover:text-foreground hover:underline">Privacy Policy</Link>
              <a href="mailto:support@geneie.chat" className="py-2 text-muted-foreground hover:text-foreground hover:underline">support@geneie.chat</a>
              <Link to="/auth" className="py-2 text-muted-foreground hover:text-foreground hover:underline">Log in</Link>
            </nav>
          </div>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-5 text-xs text-[var(--text-tertiary)] sm:px-8">
            <span>&copy; {new Date().getFullYear()} Geneie</span>
            <a
              href="https://omixir.com/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              Powered by Omixir
            </a>
          </div>
        </footer>
      </div>
    </>
  );
};

export default LandingPage;
