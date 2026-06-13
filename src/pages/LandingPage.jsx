import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatSimulation } from '@/hooks/useChatSimulation';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Silk from '@/components/Silk';
import ClickSpark from '@/components/ClickSpark';
import { useScrollReveal, useStaggerReveal } from '@/hooks/useScrollReveal';
import {
  Shield, Stethoscope, Microscope,
  Paperclip, Send, FileText,
  Lock, Database, Check, Activity, Users
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react'
import { BioEnergyIcon, MentoringIcon, SpeedTrain01Icon, ArcherIcon, AiSheetsIcon, FileTypeIcon, DashboardSpeed01Icon } from '@hugeicons/core-free-icons'

const LandingPage = () => {
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
  const scienceCardsRef = useStaggerReveal(3, { staggerDelay: 150 });
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
    { label: "Whole Genome Sequencing", icon: <Activity className="w-4 h-4" /> },
    { label: "Whole Exome Sequencing", icon: <FileText className="w-4 h-4" /> },
    { label: "Targeted Exome Sequencing", icon: <Microscope className="w-4 h-4" /> },
  ];

  const exampleQuestions = [
    "What are the most clinically relevant pathogenic variants in this whole genome dataset?",
    "Are there any variants that could explain a rare Mendelian disorder phenotype?",
    "Are there any clinically significant structural variants in this genome?"
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

  return (
    <ClickSpark sparkColor="#2F7F7A" sparkSize={12} sparkRadius={20} sparkCount={8} duration={400}>
      <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-[#2F7F7A]/30">

        {/* Main content wrapper - sits on top of fixed footer */}
        <main
          className="relative z-10 bg-white rounded-b-[2rem] sm:rounded-b-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
          style={{ marginBottom: footerHeight }}
        >

          {/* Navigation Bar */}
          <nav className={`fixed top-0 w-full z-50 transition-colors duration-300 hero-fade ${isNavSolid ? 'bg-zinc-900 border-b border-white/10 shadow-lg' : 'bg-transparent border-transparent'}`}>
            <div className="container mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src="/Logo.png"
                  alt="geneie logo"
                  className="h-6 w-6 sm:h-7 sm:w-7 object-contain"
                />
                <span className="text-xl font-bold font-heading tracking-tight text-white">geneie</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-3">
                {[
                  { label: 'Pricing', target: 'pricing' },
                  { label: 'FAQ', target: 'faq' },
                  { label: 'Contact', target: 'contact' },
                ].map((item) => (
                  <button
                    key={item.target}
                    onClick={() => {
                      if (item.target === 'contact') {
                        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                      } else {
                        document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="text-xs sm:text-sm font-medium text-zinc-400 hover:text-white transition-colors px-2 sm:px-3 py-1.5"
                  >
                    {item.label}
                  </button>
                ))}
                <Button asChild
                  variant="ghost"
                  className="text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors border border-white/60"
                >
                  <Link to="/auth">Sign In</Link>
                </Button>
              </div>
            </div>
          </nav>

          {/* 1. Hero Section (Dark Theme) */}
          <section
            ref={heroRef}
            className="relative w-full bg-zinc-950 text-white flex flex-col items-center justify-center overflow-hidden min-h-[100dvh]"
          >
            <div className="absolute inset-0 z-0 opacity-80">
              <Silk
                speed={7}
                scale={1}
                color="#7B7481"
                noiseIntensity={3}
                rotation={0}
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
              <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-lg sm:max-w-2xl mb-8 sm:mb-10 leading-relaxed hero-reveal" style={{ '--reveal-delay': '900ms' }}>
                Explore your variants, ask complex questions, and receive instant insights backed by peer-reviewed research.
              </p>

              {/* CTA */}
              <div className="hero-reveal mb-10 sm:mb-14 flex flex-col sm:flex-row items-center gap-3" style={{ '--reveal-delay': '1500ms' }}>
                <Button asChild
                  size="lg"
                  className="bg-white text-black hover:bg-zinc-200 text-base px-8 py-6 font-medium transition-all hover:scale-105 active:scale-95"
                >
                  <Link to="/auth">Get Started</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-zinc-600/50 text-zinc-500 text-base px-8 py-6 font-medium opacity-70 cursor-not-allowed hover:bg-transparent hover:text-zinc-500"
                  onClick={() =>
                    toast.info("Coming soon!")
                  }
                >
                  Try demo
                </Button>
              </div>

              {/* Professional cards — compact inline on mobile */}
              <div className="hero-reveal w-full max-w-2xl" style={{ '--reveal-delay': '2100ms' }}>
                <p className="text-zinc-500 text-[10px] sm:text-xs sm:mb-4 uppercase font-medium text-center">
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
                    <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium tracking-wide uppercase">
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
                <div className="relative h-16 md:h-20 mb-6 flex items-center justify-center overflow-hidden">
                  {workflowWords.map((word, i) => (
                    <h2
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
                    </h2>
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
                              <h3 className="text-[#2F7F7A] text-xs font-medium mb-0.5">Hello, John</h3>
                              <h4 className="text-base font-semibold font-heading text-zinc-800 tracking-tight">How can I assist you today?</h4>
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
                                  <div className={`px-3 py-1.5 rounded-xl text-[10px] leading-relaxed max-w-[80%] ${
                                    msg.role === 'user'
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
                          <h3 className="text-[#2F7F7A] text-base font-medium mb-1">Hello, John</h3>
                          <h4 className="text-3xl font-semibold font-heading text-zinc-800 tracking-tight mb-2">How can I assist you today?</h4>
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
                              <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-[75%] text-left ${
                                msg.role === 'user'
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

          {/* 3. Ask Anything Section (Dark Theme) */}
          <section className="bg-black py-24 text-white min-h-[100dvh] flex flex-col justify-center">
            <div className="container px-4 md:px-6 max-w-5xl mx-auto flex flex-col items-center">
              <div ref={askTitleRef} className="text-center mb-12">
                <h2 className="text-3xl md:text-5xl font-semibold font-heading tracking-tight mb-4 text-zinc-50">Ask Anything About Your Data</h2>
                <p className="text-zinc-400 text-base md:text-lg">From variant finding to clinical interpretation. We got answers for all your queries.</p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mb-12">
                {sequencingTypes.map((type, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg bg-neutral-900 cursor-default">
                    <span className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex items-center justify-center flex-shrink-0">
                      {React.cloneElement(type.icon, {
                        className: 'text-[#4ad6cd]/70 w-4 h-4 sm:w-[18px] sm:h-[18px]',
                      })}
                    </span>
                    <span className="text-xs sm:text-[13px] text-zinc-300 font-medium tracking-wide">
                      {type.label}
                    </span>
                  </div>
                ))}
              </div>

              <div ref={askQuestionsRef} className="w-full space-y-3">
                {exampleQuestions.map((q, i) => (
                  <div key={i} className="flex items-center p-4 md:p-5 bg-[#111] border border-zinc-800/50 rounded-xl hover:bg-[#151515] transition-colors cursor-pointer group">
                    <div className="w-8 h-8 min-w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-mono mr-4 group-hover:bg-zinc-700 transition-colors text-zinc-400">{i + 1}</div>
                    <p className="text-zinc-300 text-sm sm:text-[15px]">{q}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* <div className="w-full overflow-hidden -mb-px">
          <svg viewBox="0 0 1440 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-5 block" preserveAspectRatio="none">
            <path d="M0 0 L0 10 Q 18 17, 36 10 Q 54 3, 72 10 Q 90 17, 108 10 Q 126 3, 144 10 Q 162 17, 180 10 Q 198 3, 216 10 Q 234 17, 252 10 Q 270 3, 288 10 Q 306 17, 324 10 Q 342 3, 360 10 Q 378 17, 396 10 Q 414 3, 432 10 Q 450 17, 468 10 Q 486 3, 504 10 Q 522 17, 540 10 Q 558 3, 576 10 Q 594 17, 612 10 Q 630 3, 648 10 Q 666 17, 684 10 Q 702 3, 720 10 Q 738 17, 756 10 Q 774 3, 792 10 Q 810 17, 828 10 Q 846 3, 864 10 Q 882 17, 900 10 Q 918 3, 936 10 Q 954 17, 972 10 Q 990 3, 1008 10 Q 1026 17, 1044 10 Q 1062 3, 1080 10 Q 1098 17, 1116 10 Q 1134 3, 1152 10 Q 1170 17, 1188 10 Q 1206 3, 1224 10 Q 1242 17, 1260 10 Q 1278 3, 1296 10 Q 1314 17, 1332 10 Q 1350 3, 1368 10 Q 1386 17, 1404 10 Q 1422 3, 1440 10 L1440 0 Z"
              fill="black" />
          </svg>
        </div> */}

          {/* 4. Built for Genomics */}
          <section className="py-24 bg-white min-h-[100dvh] flex flex-col justify-center">
            <div className="container px-4 md:px-6 max-w-6xl mx-auto text-center">
              <div ref={scienceTitleRef}>
                <h2 className="text-3xl md:text-4xl font-semibold font-heading tracking-tight text-zinc-900 mb-12">Built for Genomics</h2>
              </div>
              <div ref={scienceCardsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 w-full">
                {[
                  { icon: <Database className="w-6 h-6" />, title: 'Data Compatibility', desc: 'VCF, BAM, FASTA, and FASTQ files are fully supported for seamless ingestion and analysis.' },
                  { icon: <Shield className="w-6 h-6" />, title: 'Clinical Trust & Security', desc: 'HIPAA/GDPR-compliant with end-to-end encryption and ACMG-guided databases for reliable interpretation.' },
                  { icon: <HugeiconsIcon icon={SpeedTrain01Icon} className="w-6 h-6" />, title: 'Speed & Performance', desc: 'Delivers clinically relevant insights in minutes — optimized for fast turnaround without compromising accuracy.' },
                  { icon: <Users className="w-6 h-6" />, title: 'Collaborative Approach', desc: 'Built for teams — share conversations, variant files, and analysis results across your organization.' },
                ].map((card, i) => (
                  <motion.div
                    key={i}
                    className="rounded-2xl border-2 border-zinc-200 bg-white px-6 py-10 flex flex-col items-center text-center hover:border-[#2F7F7A]/30 hover:shadow-lg transition-all"
                    initial={{ y: 6 }}
                    animate={{ y: 6 }}
                    whileHover={{ y: 0 }}
                    transition={{ ease: 'easeInOut' }}
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 text-zinc-700">
                      {card.icon}
                    </div>
                    <h3 className="text-base font-semibold font-heading text-zinc-900 mb-3">{card.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{card.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* 5. FAQ */}
          <section id="faq" className="py-24 bg-[#f5f5f0] relative isolate min-h-[100dvh] flex flex-col justify-center">
            <div 
              className="absolute inset-0 opacity-[0.3] pointer-events-none mix-blend-overlay" 
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundRepeat: 'repeat' }} />
            <div className="container px-4 md:px-6 max-w-3xl mx-auto relative">
              <div ref={faqTitleRef} className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-semibold font-heading tracking-tight text-zinc-900">
                  Frequently Asked Questions
                </h2>
              </div>
              <div ref={faqListRef}>
                <Accordion defaultValue={[]} className="w-full space-y-3">
                  {faqItems.map((item, i) => (
                    <AccordionItem key={i} value={`item-${i}`} className="bg-white border rounded-lg px-6 shadow-sm overflow-hidden data-open:ring-1 data-open:ring-zinc-200 border-b-0">
                      <AccordionTrigger className="hover:no-underline font-medium text-zinc-800 text-left py-4">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-zinc-500 leading-relaxed pb-4">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
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
                    <Button asChild size="lg" className="bg-white text-black hover:bg-zinc-200 px-6 py-6 rounded-md font-semibold text-base transition-colors w-full sm:w-auto sm:min-w-[280px]">
                      <Link to="/auth">Get Started</Link>
                    </Button>
                    <div className="text-xs text-zinc-500 font-medium flex items-center gap-1.5">
                      <Lock className="w-3 h-3" />
                      <span>No credit card required</span>
                    </div>
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
                        <h4 className="text-white font-semibold font-heading text-lg tracking-tight">Fast Processing</h4>
                        <p className="text-zinc-500 text-sm">Lightning quick variant analysis.</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
                        <HugeiconsIcon icon={ArcherIcon} className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold font-heading text-lg tracking-tight">Accurate Results</h4>
                        <p className="text-zinc-500 text-sm">Cross-referenced with ClinVar.</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
                        <Lock className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold font-heading text-lg tracking-tight">Strict Security</h4>
                        <p className="text-zinc-500 text-sm">HIPAA & GDPR compliant storage.</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
                        <Database className="w-6 h-6 text-zinc-300" />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold font-heading text-lg tracking-tight">Trusted Data</h4>
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
            <span className="text-[clamp(64px,20vw,280px)] font-bold font-heading tracking-tight leading-none text-white/[0.08] whitespace-nowrap translate-y-[20%]">
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
                  href="mailto:support@geneie.com"
                  className="text-[#2F7F7A] hover:text-[#4ad6cd] text-sm font-medium transition-colors"
                >
                  support@geneie.com
                </a>
              </div>
              <div className="flex items-center justify-between pt-10 pb-1 border-b border-zinc-800/60">
                <span className="text-zinc-600 text-xs sm:text-sm">&copy; {new Date().getFullYear()} geneie</span>
                <span className="text-zinc-500 text-xs sm:text-sm font-medium">powered by Omixir</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ClickSpark>
  );
};

export default LandingPage;