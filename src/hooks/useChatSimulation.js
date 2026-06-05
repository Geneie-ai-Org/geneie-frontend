import { useReducer, useEffect, useRef } from 'react';

const SIMULATION_PAIRS = [
  {
    question: "What are the most clinically relevant pathogenic variants in this dataset?",
    response: "I found 3 clinically relevant pathogenic variants. The most significant is a BRCA1 c.5266dupC variant classified as Pathogenic in ClinVar, associated with hereditary breast and ovarian cancer syndrome."
  },
  {
    question: "Are there variants that could explain a rare Mendelian disorder?",
    response: "Yes — I identified a homozygous CFTR variant (c.1521_1523delCTT, p.Phe508del), a well-characterized pathogenic variant for Cystic Fibrosis consistent with autosomal recessive inheritance."
  },
  {
    question: "Are there clinically significant structural variants in this genome?",
    response: "I detected a 1.5 Mb deletion at 22q11.21 associated with DiGeorge syndrome. This structural variant spans TBX1 and is classified as Pathogenic."
  }
];

const CHAR_SPEED_INPUT = 45;
const WORD_SPEED_RESPONSE = 60; // ms per word (streaming effect)

const initialState = {
  phase: 'idle',
  currentPairIndex: 0,
  inputText: '',
  messages: [],
  responseText: '',
  responseWordIndex: 0,
  sendButtonPressed: false,
  showGreeting: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'START_TYPING_INPUT':
      return { ...state, phase: 'typing_input', showGreeting: false, inputText: '' };
    case 'TICK_INPUT': {
      const pair = SIMULATION_PAIRS[state.currentPairIndex];
      const next = pair.question.slice(0, state.inputText.length + 1);
      const done = next.length >= pair.question.length;
      return { ...state, inputText: next, phase: done ? 'input_done' : state.phase };
    }
    case 'PRESS_SEND':
      return { ...state, sendButtonPressed: true, phase: 'sending' };
    case 'SEND_COMPLETE': {
      const pair = SIMULATION_PAIRS[state.currentPairIndex];
      return {
        ...state,
        sendButtonPressed: false,
        inputText: '',
        messages: [...state.messages, { role: 'user', text: pair.question }],
        phase: 'thinking',
      };
    }
    case 'START_TYPING_RESPONSE':
      return {
        ...state,
        phase: 'typing_response',
        responseWordIndex: 0,
        messages: [...state.messages, { role: 'assistant', text: '' }],
      };
    case 'TICK_RESPONSE': {
      const pair = SIMULATION_PAIRS[state.currentPairIndex];
      const words = pair.response.split(' ');
      const nextIdx = state.responseWordIndex + 1;
      const done = nextIdx >= words.length;
      const updatedText = words.slice(0, nextIdx).join(' ');
      const msgs = [...state.messages];
      msgs[msgs.length - 1] = { role: 'assistant', text: updatedText };
      return {
        ...state,
        responseWordIndex: nextIdx,
        messages: msgs,
        phase: done ? 'pause' : state.phase,
      };
    }
    case 'START_RESET':
      return { ...state, phase: 'resetting' };
    case 'RESET': {
      const nextIndex = (state.currentPairIndex + 1) % SIMULATION_PAIRS.length;
      return { ...initialState, currentPairIndex: nextIndex, phase: 'idle' };
    }
    default:
      return state;
  }
}

export function useChatSimulation({ isVisible = true, startDelay = 2000 } = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  const clearTimers = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  useEffect(() => {
    if (!isVisible) return;
    clearTimers();

    switch (state.phase) {
      case 'idle':
        timeoutRef.current = setTimeout(() => dispatch({ type: 'START_TYPING_INPUT' }), startDelay);
        break;

      case 'typing_input':
        intervalRef.current = setInterval(() => dispatch({ type: 'TICK_INPUT' }), CHAR_SPEED_INPUT);
        break;

      case 'input_done':
        timeoutRef.current = setTimeout(() => dispatch({ type: 'PRESS_SEND' }), 400);
        break;

      case 'sending':
        timeoutRef.current = setTimeout(() => dispatch({ type: 'SEND_COMPLETE' }), 300);
        break;

      case 'thinking':
        timeoutRef.current = setTimeout(() => dispatch({ type: 'START_TYPING_RESPONSE' }), 1800);
        break;

      case 'typing_response':
        intervalRef.current = setInterval(() => dispatch({ type: 'TICK_RESPONSE' }), WORD_SPEED_RESPONSE);
        break;

      // response_done removed — TICK_RESPONSE transitions directly to 'pause'

      case 'pause':
        timeoutRef.current = setTimeout(() => dispatch({ type: 'START_RESET' }), 3500);
        break;

      case 'resetting':
        timeoutRef.current = setTimeout(() => dispatch({ type: 'RESET' }), 600);
        break;
    }

    return clearTimers;
  }, [state.phase, isVisible, startDelay]);

  return state;
}
