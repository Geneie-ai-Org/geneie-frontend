import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatSimulation } from '@/hooks/useChatSimulation';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

import CardSwap, { Card } from '@/components/ui/CardSwap';
import Carousel from '@/components/ui/Carousel';
import '@/components/ui/Carousel.css';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import wgsIcon from '@/WGS.svg';
import wesIcon from '@/WES.svg';
import Silk from '@/components/Silk';
import ClickSpark from '@/components/ClickSpark';
import { useScrollReveal, useStaggerReveal } from '@/hooks/useScrollReveal';
import {
  Shield, Stethoscope, Microscope,
  Paperclip, Send, FileText,
  Lock, Database, Check, Activity
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react'
import { useForcedTheme } from '@/hooks/useTheme'
import { useSeo } from '@/hooks/useSeo'
import BioEnergyIcon from '@hugeicons/core-free-icons/BioEnergyIcon'
import MentoringIcon from '@hugeicons/core-free-icons/MentoringIcon'
import SpeedTrain01Icon from '@hugeicons/core-free-icons/SpeedTrain01Icon'
import ArcherIcon from '@hugeicons/core-free-icons/ArcherIcon'
import AiSheetsIcon from '@hugeicons/core-free-icons/AiSheetsIcon'
import FileTypeIcon from '@hugeicons/core-free-icons/FileTypeIcon'
import DashboardSpeed01Icon from '@hugeicons/core-free-icons/DashboardSpeed01Icon'

const LandingPage = () => {
  useForcedTheme('dark');
  useSeo({
    title: 'Geneie — Chat with Your Genomic Data | AI Variant Analysis',
    description:
      'Upload a VCF and explore your variants in plain language. Geneie pairs ANNOVAR annotation, ACMG classification and phenotype-driven AI prioritization with chat.',
    path: '/',
  });
  const navigate = useNavigate();
  const [isNavSolid, setIsNavSolid] = useState(false);
  const [activeWord, setActiveWord] = useState(0);
  const workflowWords = ["Upload.", "Annotate.", "Filter.", "Ask.", "Discover."];
  const heroRef = useRef(null);
  const footerRef = useRef(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const chatSectionRef = useRef(null);
  const [chatSectionVisible, setChatSectionVisible] = useState(false);
  const sim = useChatSimulation({ isVisible: chatSectionVisible, startDelay: 2000 });

  // Measure footer height for the margin-bottom on main
  useEffect(() => {
    const updateHeight = () => {
      if (footerRef.current) {
        setFooterHeight(footerRef.current.offsetHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Scroll reveal refs for each section
  // assistantTitleRef/assistantChatRef removed — no fade on section 2
  const askTitleRef = useScrollReveal();
  const askQuestionsRef = useStaggerReveal(3, { staggerDelay: 150 });
  const askCardsRef = useStaggerReveal(3, { staggerDelay: 120 });
  const scienceTitleRef = useScrollReveal();

  const faqTitleRef = useScrollReveal();
  const faqListRef = useScrollReveal({ threshold: 0.1 });
  const ctaRef = useScrollReveal({ threshold: 0.1 });

  // Observe chat section visibility for simulation
  useEffect(() => {
    const el = chatSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setChatSectionVisible(entry.isIntersecting), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveWord((prev) => (prev + 1) % workflowWords.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        // Find bottom coordinate of hero block relative to viewport top
        const heroBottom = heroRef.current.getBoundingClientRect().bottom;
        const navHeight = 64; // 4rem = h-16

        // When hero bottom is about to slide underneath the nav bar (+50px buffer),
        // make the nav bar solid so the next white section doesn't show through.
        if (heroBottom <= navHeight + 50) {
          setIsNavSolid(true);
        } else {
          setIsNavSolid(false);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Call once to set initial state if user loads halfway down the page
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const professionalCards = [
    {
      title: "Clinicians",
      icon: <Stethoscope className="w-5 h-5" strokeWidth={1.5} />,
    },
    {
      title: "Researchers",
      icon: <Microscope className="w-5 h-5" strokeWidth={1.5} />,
    },
    {
      title: "Genetic Counselors",
      icon: <HugeiconsIcon icon={MentoringIcon} className="w-5 h-5" strokeWidth={1.5} />,
    },
    {
      title: "Bioinformaticians",
      icon: <HugeiconsIcon icon={BioEnergyIcon} size={24} strokeWidth={1.5} />,
    }
  ];

  const sequencingTypes = [
    { label: "Whole Genome Sequencing", icon: <img src={wgsIcon} alt="" aria-hidden className="w-full h-full object-contain" /> },
    { label: "Whole Exome Sequencing", icon: <img src={wesIcon} alt="" aria-hidden className="w-full h-full object-contain" /> },
  ];

  const exampleQuestions = [
    "What are the most clinically relevant pathogenic variants in this whole genome dataset?",
    "Are there any variants that could explain a rare Mendelian disorder phenotype?",
    "Are there any clinically significant structural variants in this genome?"
  ];

  const askAnythingFaqs = [
    {
      q: "Can I filter genomic variants based on a patient's actual physical symptoms?",
      a: "Yes. Geneie uses phenotype-driven prioritization. Input clinical symptoms via natural language, and the platform will instantly highlight variants matching that specific patient profile."
    },
    {
      q: "Can I export the data for my own clinical reports or research publications?",
      a: "Absolutely. Geneie analyzes your complex genomic data into clean, interpretable tables. With a single click, users can copy insights or export customized variant tables directly into Excel sheets for seamless integration into medical reports or peer-reviewed publications."
    },
    {
      q: "Since Geneie uses AI, is there a risk of it \"hallucinating\" medical data?",
      a: "No. Geneie is engineered with a strict \"Zero-Hallucination\" architecture. Our in-house Large Language Model (LLM) is restricted exclusively to translating your natural language queries. All actual clinical scoring, data matching, and variant filtering are executed by deterministic, established bioinformatics pipelines, ensuring results are always scientifically defensible."
    }
  ];

  const faqItems = [
    {
      q: "Is this intended for clinical or research use?",
      a: "The platform is designed to support both research and clinical workflows. Results should be interpreted by qualified professionals within the appropriate clinical or scientific context."
    },
    {
      q: "Is my genomic data secure?",
      a: "All data is protected using end-to-end encryption and handled in compliance with HIPAA, GDPR, and other global data protection standards. Your data remains private throughout the analysis process."
    },
    {
      q: "How accurate is the analysis?",
      a: "Our platform uses validated pipelines for variant calling and annotation, aligned with established clinical standards. Interpretation is supported by curated databases and recognized guidelines to ensure reliable results."
    }
  ];

  // Both accordions are collapsed on load, so their answers are easy for a crawler
  // to miss. FAQPage schema states them outright and makes the page eligible for
  // FAQ rich results.
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [...askAnythingFaqs, ...faqItems].map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <ClickSpark sparkColor="#2F7F7A" sparkSize={12} sparkRadius={20} sparkCount={8} duration={400}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-[#2F7F7A]/30">

        {/* Main content wrapper - sits on top of fixed footer */}
        <main
          className="relative z-10 bg-white rounded-b-[2rem] sm:rounded-b-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
          style={{ marginBottom: footerHeight }}
        >

          {/* Navigation Bar */}
          <nav className={`fixed top-0 w-full z-50 transition-colors duration-300 hero-fade ${isNavSolid ? 'bg-zinc-900 shadow-lg' : 'bg-transparent border-transparent'}`}>
            <div className="container mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src="/logo/Final gene dark.svg"
                  alt="Geneie"
                  width="96"
                  height="96"
                  className="h-20 w-20 sm:h-24 sm:w-24 object-contain"
                />
                {/* <span className="text-xl font-bold font-brand tracking-tight text-white">geneie</span> */}
              </div>
              <div className="flex items-center gap-1 sm:gap-3">
                {/* Real anchors, not buttons: crawlers follow them as internal links to
                    the named sections, and they still smooth-scroll on click. */}
                {[
                  { label: 'Pricing', target: 'pricing' },
                  { label: 'FAQ', target: 'faq' },
                  { label: 'Contact', target: 'contact' },
                ].map((item) => (
                  <a
                    key={item.target}
                    href={`#${item.target}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (item.target === 'contact') {
                        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                      } else {
                        document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="text-xs sm:text-sm font-medium text-zinc-400 hover:text-white transition-colors px-2 sm:px-3 py-1.5"
                  >
                    {item.label}
                  </a>
                ))}
                <Button
                  variant="ghost"
                  className="text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors border border-white/60"
                  onClick={() => { console.log('[LandingPage] Sign In clicked — navigating to /auth'); navigate('/auth'); }}
                >
                  Sign In
                </Button>
              </div>
            </div>
          </nav>

          {/* 1. Hero Section (Dark Theme) */}
          <section
            ref={heroRef}
            className="relative w-full bg-zinc-950 text-white flex flex-col items-center justify-center overflow-hidden min-h-[100dvh]"
          >
            <div className="absolute inset-0 z-0">
              {/* <Silk
                speed={7}
                scale={1}
                color="#7B7481"
                noiseIntensity={3}
                rotation={0}
              /> */}
              <video
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
                poster="/hero-helix.webp"
                className="absolute inset-0 h-full w-full object-cover object-center pointer-events-none select-none"
                src="/helix_2_ascii.mp4"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/60 to-zinc-950 z-0 pointer-events-none" />

            <div className="container relative z-10 px-5 md:px-6 flex flex-col items-center text-center pt-24 pb-16 sm:pt-32 sm:pb-20 lg:py-0">
              {/* Main headline + subtext */}
              <h1
                className="text-[2.25rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-7xl font-bold font-heading tracking-tight mb-4 sm:mb-6 max-w-4xl text-balance hero-reveal"
                style={{ '--reveal-delay': '300ms' }}>
                Chat with your Genomic Data
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-zinc-300 max-w-lg sm:max-w-2xl mb-8 sm:mb-10 leading-relaxed hero-reveal" style={{ '--reveal-delay': '900ms' }}>
                Explore your variants, ask complex questions, and receive instant insights backed by peer-reviewed research.
              </p>

              {/* CTA */}
              <div className="hero-reveal mb-10 sm:mb-14 flex flex-col sm:flex-row items-center gap-3" style={{ '--reveal-delay': '1500ms' }}>
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-zinc-200 text-base px-8 py-6 font-medium transition-all hover:scale-105 active:scale-95"
                  onClick={() => navigate('/auth')}
                >
                  Get Started
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-zinc-400 text-zinc-500 text-base px-8 py-6 font-medium cursor-not-allowed hover:bg-transparent hover:text-zinc-500"
                  onClick={() =>
                    toast.info("Coming soon!")
                  }
                >
                  Try demo
                </Button>
              </div>

              {/* Professional cards — compact inline on mobile */}
              <div className="hero-reveal w-full max-w-2xl" style={{ '--reveal-delay': '2100ms' }}>
                <p className="text-zinc-300 sm:text-md sm:mb-4 uppercase font-medium text-center">
                  Built for genomics professionals including
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3 gap-y-1">
                  {professionalCards.map((card, i) => (
                    <div
                      key={i}
                      className="hero-reveal flex items-center gap-2 sm:gap-3"
                      style={{ '--reveal-delay': `${2400 + i * 150}ms` }}
                    >
                      {i > 0 && (
                        <span className="text-zinc-600 select-none" aria-hidden="true">·</span>
                      )}
                      <span className="text-[14px] sm:text-[14px] text-zinc-300/80 font-medium tracking-wide uppercase">
                        {card.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 2. Interactive Genomics Assistant */}
          <section className="py-24 bg-white relative min-h-[100dvh] flex flex-col justify-center">
            <div className="container px-4 md:px-6 max-w-5xl mx-auto text-center">
              <div>
                {/* One real heading for the section. The rotating words are the same
                    copy animated, so they stay presentational rather than shipping
                    five competing <h2>s. */}
                <h2 className="sr-only">Upload. Annotate. Filter. Ask. Discover.</h2>
                <div className="relative h-16 md:h-20 mb-6 flex items-center justify-center overflow-hidden" aria-hidden="true">
                  {workflowWords.map((word, i) => (
                    <span
                      key={word}
                      className={`absolute text-3xl md:text-5xl font-semibold font-heading tracking-tight transition-all duration-700 ease-in-out ${i === activeWord
                        ? 'opacity-100 translate-y-0 scale-100'
                        : i === (activeWord - 1 + workflowWords.length) % workflowWords.length
                          ? 'opacity-0 -translate-y-8 scale-95'
                          : 'opacity-0 translate-y-8 scale-95'
                        }`}
                      style={{ color: '#18181b' }}
                    >
                      {word}
                    </span>
                  ))}
                </div>
                <div className="flex justify-center gap-2 mb-16">
                  {workflowWords.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all duration-500 ${i === activeWord ? 'w-6 bg-[#2F7F7A]' : 'w-2 bg-zinc-300'
                        }`}
                    />
                  ))}
                </div>
              </div>

              {/* Mobile: iPhone-style phone frame mockup */}
              <div className="mb-8 mx-auto md:hidden max-w-[280px]">
                <div className="bg-gradient-to-b from-[#e0e0e0] to-[#c8c8c8] rounded-[3rem] p-[6px] shadow-[0_20px_60px_rgba(0,0,0,0.25)] relative">
                  {/* Side button accents */}
                  <div className="absolute -right-[2px] top-[100px] w-[3px] h-8 bg-[#d0d0d0] rounded-r-sm" />
                  <div className="absolute -left-[2px] top-[80px] w-[3px] h-6 bg-[#d0d0d0] rounded-l-sm" />
                  <div className="absolute -left-[2px] top-[120px] w-[3px] h-10 bg-[#d0d0d0] rounded-l-sm" />
                  <div className="absolute -left-[2px] top-[140px] w-[3px] h-10 bg-[#d0d0d0] rounded-l-sm" />
                  {/* Inner bezel */}
                  <div className="bg-black rounded-[2.6rem] p-[3px]">
                    {/* Screen */}
                    <div className="bg-[#faf9f6] rounded-[2.4rem] aspect-[9/19] w-full flex flex-col items-center relative overflow-hidden">
                      {/* Status bar */}
                      <div className="w-full flex items-center justify-between px-6 pt-3 pb-1 relative z-10">
                        <span className="text-[10px] font-semibold text-zinc-800">9:41</span>
                        {/* Dynamic Island */}
                        <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-20 h-[22px] bg-black rounded-full" />
                        <div className="flex items-center gap-0.5">
                          <div className="w-3 h-2 border border-zinc-800 rounded-[2px] relative">
                            <div className="absolute inset-[1px] right-[2px] bg-zinc-800 rounded-[1px]" />
                            <div className="absolute right-[-2px] top-1/2 -translate-y-1/2 w-[1px] h-1 bg-zinc-800 rounded-r-full" />
                          </div>
                        </div>
                      </div>
                      {/* Chat Body */}
                      <div className="flex-1 w-full flex flex-col p-4 pb-16 overflow-hidden">
                        <AnimatePresence mode="wait">
                          {sim.showGreeting ? (
                            <motion.div
                              key="mob-greeting"
                              className="flex-1 flex flex-col items-center justify-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div className="animate-dynamic-breathe w-16 h-16 rounded-full bg-gradient-to-tr from-purple-100 via-white to-blue-50 border-[3px] border-white shadow-xl mb-4 relative overflow-hidden flex items-center justify-center">
                                <div className="absolute inset-0 bg-[#2F7F7A]/10 backdrop-blur-3xl rounded-full" />
                                <div className="w-10 h-10 bg-white/60 rounded-full shadow-inner blur-sm" />
                              </div>
                              <p className="text-[#2F7F7A] text-xs font-medium mb-0.5">Hello, John</p>
                              <p className="text-base font-semibold font-heading text-zinc-800 tracking-tight">How can I assist you today?</p>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="mob-chat"
                              className="flex-1 flex flex-col justify-end gap-2 w-full"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              {sim.messages.slice(-2).map((msg, i) => (
                                <motion.div
                                  key={i}
                                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                >
                                  <div className={`px-3 py-1.5 rounded-xl text-[10px] leading-relaxed max-w-[80%] ${msg.role === 'user'
                                    ? 'bg-[#2F7F7A] text-white rounded-br-sm'
                                    : 'bg-zinc-100 text-zinc-800 rounded-bl-sm'
                                    }`}>{msg.text}</div>
                                </motion.div>
                              ))}
                              {sim.phase === 'thinking' && (
                                <motion.div className="flex justify-start" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                  <div className="bg-zinc-100 px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-1">
                                    <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                  </div>
                                </motion.div>
                              )}
                              {/* Response streamed directly into messages array */}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      {/* Chat Input */}
                      <div className="absolute bottom-5 left-3 right-3">
                        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-sm">
                          <span className="text-xs flex-1 truncate text-left" style={{ color: sim.inputText ? '#18181b' : '#a1a1aa' }}>
                            {sim.inputText || 'Ask me anything...'}
                            {sim.phase === 'typing_input' && sim.inputText && <span className="blink-cursor" />}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div className="p-1.5 rounded-md"><Paperclip className="w-3 h-3 text-zinc-400" /></div>
                            <motion.div
                              className="bg-[#2F7F7A] text-white p-1.5 rounded-lg"
                              animate={{ scale: sim.sendButtonPressed ? 0.85 : 1 }}
                              transition={{ duration: 0.1 }}
                            >
                              <Send className="w-3 h-3 rounded-none" />
                            </motion.div>
                          </div>
                        </div>
                      </div>
                      {/* Home indicator */}
                      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-zinc-900 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop: wide chat card with simulation */}
              <div ref={chatSectionRef} className="mb-8 p-2 bg-zinc-100 border border-zinc-200 shadow-lg rounded-[2.5rem] relative overflow-hidden mx-auto hidden md:block">
                <div className="bg-[#faf9f6] rounded-[2rem] aspect-video max-h-[680px] w-full flex flex-col relative border border-zinc-100 overflow-hidden">

                  {/* Chat Body */}
                  <div className="flex-1 w-full flex flex-col p-6 pb-24 overflow-hidden">
                    <AnimatePresence mode="wait">
                      {sim.showGreeting ? (
                        <motion.div
                          key="greeting"
                          className="flex-1 flex flex-col items-center justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.4 }}
                        >
                          <div className="animate-dynamic-breathe w-28 h-28 rounded-full bg-gradient-to-tr from-purple-100 via-white to-blue-50 border-4 border-white shadow-xl mb-6 relative overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 bg-[#2F7F7A]/10 backdrop-blur-3xl rounded-full" />
                            <div className="w-16 h-16 bg-white/60 rounded-full shadow-inner blur-sm" />
                          </div>
                          <p className="text-[#2F7F7A] text-base font-medium mb-1">Hello, John</p>
                          <p className="text-3xl font-semibold font-heading text-zinc-800 tracking-tight mb-2">How can I assist you today?</p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="chat"
                          className="flex-1 flex flex-col justify-end gap-3 w-full"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.4 }}
                        >
                          {/* Rendered messages */}
                          {sim.messages.map((msg, i) => (
                            <motion.div
                              key={i}
                              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-[75%] text-left ${msg.role === 'user'
                                ? 'bg-[#2F7F7A] text-white rounded-br-md'
                                : 'bg-zinc-100 text-zinc-800 rounded-bl-md'
                                }`}>
                                {msg.text}
                              </div>
                            </motion.div>
                          ))}

                          {/* Thinking indicator */}
                          {sim.phase === 'thinking' && (
                            <motion.div
                              className="flex justify-start"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="bg-zinc-100 text-zinc-500 px-4 py-3 rounded-2xl rounded-bl-md">
                                <div className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {/* Response text is now streamed directly into messages array — no separate bubble needed */}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Chat Input */}
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                      <div className="flex-1 h-8 flex items-center text-base">
                        {sim.inputText ? (
                          <span className="text-zinc-800">
                            {sim.inputText}
                            {sim.phase === 'typing_input' && <span className="blink-cursor" />}
                          </span>
                        ) : (
                          <span className="text-zinc-400">Ask me anything...</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="p-2 rounded-md min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-400"><Paperclip className="w-4 h-4" /></div>
                        <motion.div
                          className="bg-[#2F7F7A] text-white p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl shadow-sm"
                          animate={{ scale: sim.sendButtonPressed ? 0.85 : 1 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Send className="w-4 h-4" />
                        </motion.div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </section>
          
{/* 3. Ask Anything Section */}
<section className="bg-black py-24 text-white min-h-[100dvh] flex flex-col justify-center relative overflow-hidden">
  
  {/* Background Image with Left-to-Right Gradient Overlay */}
  <div className="absolute inset-0 z-0 pointer-events-none select-none">
    <img
      src="/hero-helix.webp"
      alt=""
      aria-hidden="true"
      width="1280"
      height="711"
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover object-right lg:translate-x-[28%]"
    />
    {/* Gradient: Dark on left for text readability, clearer on right */}
    <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/20" />
  </div>

  {/* Foreground Content */}
  <div className="relative z-10 container px-4 md:px-6 max-w-7xl mx-auto">
    <div className="w-full lg:w-[60%] flex flex-col">
      <div ref={askTitleRef} className="text-left mb-8">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-heading tracking-tight mb-4 text-white">
          Ask Anything About Your Data
        </h2>
        <p className="text-zinc-400 text-base sm:text-lg max-w-xl text-left">
          Instant clinical insights for complex genomic data
        </p>
      </div>

      {/* Cards */}
      <div className="w-full grid grid-cols-2 gap-3 sm:gap-4 mb-8">
        {sequencingTypes.map((type, i) => (
          <div
            key={i}
            className="relative flex flex-col justify-between w-full rounded-2xl bg-zinc-900/70 backdrop-blur-sm border border-zinc-800/80 p-4 min-h-[180px] sm:min-h-[200px]"
          >
            {/* Icon Badge */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center p-2 text-[#4ad6cd]">
              {React.cloneElement(type.icon, {
                className: 'w-8 h-8 sm:w-10 sm:h-10 text-[#4ad6cd] object-contain',
              })}
            </div>

            {/* Centered Text */}
            <div className="mt-auto text-center">
              <h3 className="text-base sm:text-lg lg:text-xl text-zinc-100 leading-snug text-center">
                {type.label}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* Accordion List */}
      <div ref={askQuestionsRef} className="w-full">
        <Accordion defaultValue={[]} className="w-full space-y-3">
          {askAnythingFaqs.map((item, i) => (
            <AccordionItem
              key={i}
              value={`ask-${i}`}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-sm px-5 sm:px-6 overflow-hidden data-[state=open]:border-[#2F7F7A]/50 data-[state=open]:bg-zinc-900/90 border-b-0"
            >
              <AccordionTrigger className="hover:no-underline font-medium text-zinc-100 text-left py-4 sm:py-5 text-sm sm:text-base items-center gap-4">
                <span className="flex-1">{item.q}</span>
              </AccordionTrigger>
              <AccordionContent className="text-zinc-400 text-sm sm:text-base leading-relaxed pt-1 pb-5 pr-2">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  </div>
</section>

          {/* 4. Built for Genomics + FAQ (combined) */}
          <section id="faq" className="py-24 bg-zinc-950 lg:bg-[#EDF7F6] relative isolate min-h-[100dvh] flex flex-col justify-center">
            <div className="container px-4 md:px-6 max-w-6xl mx-auto">

              {/* Desktop: bordered box | Mobile: no box, content flows on dark bg */}
              <div className="relative lg:rounded-2xl lg:border lg:border-zinc-800 lg:bg-zinc-950 lg:overflow-hidden lg:min-h-[580px]">

                {/* Heading + Collapsible FAQ */}
                <div className="relative z-10 py-4 lg:p-16 max-w-full lg:max-w-lg" ref={faqTitleRef}>
                  <h2 className="text-3xl md:text-4xl font-semibold font-heading tracking-tight text-white mb-1">
                    Built for Genomics
                  </h2>
                  <p className="text-zinc-400 text-base mb-10">
                    Have questions? We've got answers.
                  </p>

                  <div ref={faqListRef}>
                    <Accordion defaultValue={[]} className="w-full space-y-3">
                      {faqItems.map((item, i) => (
                        <AccordionItem
                          key={i}
                          value={`item-${i}`}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm px-5 overflow-hidden transition-colors hover:border-zinc-700 border-b-0"
                        >
                          <AccordionTrigger className="hover:no-underline font-medium text-white text-left py-4 text-sm">
                            {item.q}
                          </AccordionTrigger>
                          <AccordionContent className="text-zinc-400 text-sm leading-relaxed pb-4">
                            {item.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </div>

                {/* Desktop: Feature cards in CardSwap — anchored bottom-right */}
                <div ref={scienceTitleRef} className="absolute inset-0 pointer-events-none hidden lg:block">
                  <div className="pointer-events-auto" style={{ position: 'absolute', bottom: 0, right: 0, width: 580, height: 500 }}>
                    <CardSwap
                      width={530}
                      height={420}
                      cardDistance={60}
                      verticalDistance={70}
                      delay={3000}
                      pauseOnHover={true}
                      skewAmount={6}
                      easing="elastic"
                    >
                      {[
                        { icon: <Database className="w-6 h-6" />, title: 'Data Compatibility', desc: 'VCF, BAM, FASTA, and FASTQ files are fully supported for seamless ingestion and analysis.' },
                        { icon: <Shield className="w-6 h-6" />, title: 'Clinical Trust & Security', desc: 'HIPAA/GDPR-compliant with end-to-end encryption and ACMG-guided databases for reliable interpretation.' },
                        { icon: <HugeiconsIcon icon={SpeedTrain01Icon} className="w-6 h-6" />, title: 'Speed & Performance', desc: 'Delivers clinically relevant insights in minutes — optimized for fast turnaround without compromising accuracy.' },
                      ].map((card, i) => (
                        <Card
                          key={i}
                          className="rounded-2xl border border-zinc-700/50 bg-zinc-900 p-8 flex flex-col"
                        >
                          <div className="w-12 h-12 rounded-xl bg-[#2F7F7A]/15 flex items-center justify-center mb-5 text-[#2F7F7A]">
                            {card.icon}
                          </div>
                          <h3 className="text-lg font-semibold font-heading text-white mb-2">{card.title}</h3>
                          <p className="text-zinc-400 text-sm leading-relaxed">{card.desc}</p>
                        </Card>
                      ))}
                    </CardSwap>
                  </div>
                </div>
              </div>

              {/* Mobile: Carousel below, outside the box */}
              {/* <div className="lg:hidden flex items-center justify-center mt-2" style={{ height: 340, position: 'relative' }}>
                <Carousel
                  baseWidth={340}
                  autoplay={true}
                  autoplayDelay={4000}
                  pauseOnHover={true}
                  loop={true}
                  items={[
                    { id: 1, icon: <Database className="w-5 h-5" />, title: 'Data Compatibility', description: 'VCF, BAM, FASTA, and FASTQ files are fully supported for seamless ingestion and analysis.' },
                    { id: 2, icon: <Shield className="w-5 h-5" />, title: 'Clinical Trust & Security', description: 'HIPAA/GDPR-compliant with end-to-end encryption and ACMG-guided databases for reliable interpretation.' },
                    { id: 3, icon: <HugeiconsIcon icon={SpeedTrain01Icon} className="w-5 h-5" />, title: 'Speed & Performance', description: 'Delivers clinically relevant insights in minutes — optimized for fast turnaround without compromising accuracy.' },
                  ]}
                />
              </div> */}

            </div>
          </section>

          {/* 6. CTA / Pricing Section */}
          <section id="pricing" className="py-24 bg-white relative min-h-[100dvh] flex flex-col justify-center">
            <div className="container px-4 md:px-6 max-w-6xl mx-auto">
              <div ref={ctaRef} className="bg-black text-white rounded-[2rem] lg:rounded-[3rem] px-6 py-12 sm:p-10 md:p-12 lg:p-16 flex flex-col lg:flex-row items-center gap-12 overflow-hidden relative shadow-2xl">
                {/* Left Box */}
                <div className="flex-1 relative z-10 w-full lg:max-w-xl">
                  {/* Centered heading and subheading on mobile */}
                  <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-semibold font-heading leading-tight mb-6 text-center lg:text-left">
                    Ready to Transform Your Genomic Analysis?
                  </h2>
                  <p className="text-zinc-400 text-base md:text-lg mb-8 max-w-md mx-auto lg:mx-0 text-center lg:text-left text-pretty">
                    Join today and accelerate research and clinical decisions with the help of AI.
                  </p>

                  {/* Feature list */}
                  <div className="mb-10 lg:max-w-none max-w-sm mx-auto lg:mx-0 hidden lg:block">
                    <div className="grid grid-cols-2 lg:flex lg:flex-col gap-2 lg:gap-3 text-sm text-zinc-300">
                      {["Free queries included", "Export files instantly", "Real-time analysis", "HIPAA compliant"].map((item) => (
                        <div key={item} className="flex items-center justify-center lg:justify-start gap-2 lg:gap-2.5 bg-zinc-900 lg:bg-transparent rounded-full lg:rounded-none px-3 py-2 lg:p-0 border border-zinc-800 lg:border-0">
                          <Check className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-zinc-500 flex-shrink-0 hidden lg:block" />
                          <span className="text-xs lg:text-sm whitespace-nowrap">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* TODO: Change label to "Start Free Trial" and link to pricing/checkout when subscription breakdown is done (Dodo payment) */}
                  <div className="flex flex-col items-center lg:items-start gap-3">
                    <Button size="lg" className="bg-white text-black hover:bg-zinc-200 px-6 py-6 rounded-md font-semibold text-base transition-colors w-full sm:w-auto sm:min-w-[280px]" onClick={() => navigate('/auth')}>
                      Get Started
                    </Button>
                  </div>
                </div>

                {/* Right Clean Data Graphic */}
                <div className="hidden lg:flex flex-1 w-full flex-col items-center lg:items-end justify-center relative mt-12 lg:mt-0">
                  <div className="w-full max-w-sm space-y-4">
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
                        <HugeiconsIcon icon={SpeedTrain01Icon} className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold font-heading text-lg tracking-tight">Fast Processing</h3>
                        <p className="text-zinc-500 text-sm">Lightning quick variant analysis.</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
                        <HugeiconsIcon icon={ArcherIcon} className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold font-heading text-lg tracking-tight">Accurate Results</h3>
                        <p className="text-zinc-500 text-sm">Cross-referenced with ClinVar.</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
                        <Lock className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold font-heading text-lg tracking-tight">Strict Security</h3>
                        <p className="text-zinc-500 text-sm">HIPAA & GDPR compliant storage.</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
                        <Database className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold font-heading text-lg tracking-tight">Trusted Data</h3>
                        <p className="text-zinc-500 text-sm">Peer-reviewed research sources.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </main>

        {/* 7. Footer */}
        <footer id="contact" ref={footerRef} className="fixed bottom-0 left-0 right-0 z-0 bg-zinc-950 overflow-hidden">

          <div className="absolute inset-0 flex items-end justify-center pointer-events-none select-none overflow-hidden" aria-hidden="true">
            <span className="text-[clamp(64px,20vw,280px)] font-bold font-heading tracking-tight leading-none text-white/[0.08] whitespace-nowrap translate-y-[2%]">
              geneie
            </span>
          </div>

          <div className="container px-6 md:px-8 mx-auto pt-16 md:pt-24 pb-12 md:pb-20 relative z-10">
            <div className="flex flex-col gap-12 md:gap-16">
              <div>
                <p className="text-zinc-500 text-sm sm:text-base leading-relaxed mb-4">
                  AI-powered genomic analysis for researchers and clinicians.
                </p>
                <a
                  href="mailto:support@geneie.chat"
                  className="text-[#2F7F7A] hover:text-[#4ad6cd] text-sm font-medium transition-colors"
                >
                  support@geneie.chat
                </a>
              </div>
              <div className="flex items-center justify-between pt-10 pb-1 border-b border-zinc-800/60">
                <span className="text-zinc-600 text-xs sm:text-sm">&copy; {new Date().getFullYear()} geneie</span>
                <span className="flex items-center gap-1.5 text-zinc-500 text-xs sm:text-sm font-medium">
                  powered by
                  <img src="/omixer-small-logo.png" alt="Omixir" className="h-4 sm:h-5 object-contain" />
                  Omixir
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ClickSpark>
  );
};

export default LandingPage;