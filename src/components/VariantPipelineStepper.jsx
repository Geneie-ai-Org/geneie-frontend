import React, { useMemo } from 'react';
import { Check, Circle, Loader2, Minus, AlertCircle } from 'lucide-react';
import {
  PIPELINE_STEP_DEFS,
  computePipelineSteps,
  getPipelineBackgroundActive,
  getPipelineStatusLine,
} from '@/lib/variantPipelineSteps';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const STATUS_VARIANT = {
  done: 'default',
  running: 'secondary',
  failed: 'destructive',
  skipped: 'outline',
  pending: 'outline',
};

function StepIcon({ status }) {
  if (status === 'running') {
    return <Loader2 className="w-4 h-4 animate-spin text-[#2F7F7A]" aria-hidden />;
  }
  if (status === 'done') {
    return <Check className="w-4 h-4 text-[#2F7F7A]" aria-hidden />;
  }
  if (status === 'failed') {
    return <AlertCircle className="w-4 h-4 text-red-600" aria-hidden />;
  }
  if (status === 'skipped') {
    return <Minus className="w-4 h-4 text-gray-400" aria-hidden />;
  }
  return <Circle className="w-4 h-4 text-gray-300" aria-hidden />;
}

/** Full-width pipeline bar (legacy). Prefer VariantAnalysisPipeline for chat UI. */
const VariantPipelineStepper = (props) => {
  const steps = useMemo(() => computePipelineSteps(props), [props]);
  const backgroundActive = getPipelineBackgroundActive(props);
  const statusLine = getPipelineStatusLine(props, steps);

  return (
    <section
      className="border-b border-gray-200 px-4 py-3"
      style={{ backgroundColor: '#F1F6F3' }}
      aria-label="Variant analysis pipeline progress"
    >
      <div className="max-w-4xl mx-auto">
        <p className="text-xs font-semibold text-gray-700 mb-2">Analysis pipeline</p>
        <ol className="flex flex-wrap items-center gap-2">
          {PIPELINE_STEP_DEFS.map((def, index) => {
            const status = steps[def.id];
            const isLast = index === PIPELINE_STEP_DEFS.length - 1;
            return (
              <li key={def.id} className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[status] || 'outline'} className="gap-1.5">
                  <StepIcon status={status} />
                  <span>{def.label}</span>
                </Badge>
                {!isLast && (
                  <Separator orientation="vertical" className="hidden sm:block h-4" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>
        <p
          className={`mt-2 text-xs leading-relaxed ${
            props.chatEligibility?.allowed ? 'text-[#2F7F7A]' : 'text-gray-600'
          }`}
        >
          {backgroundActive && (
            <span className="font-medium text-[#2F7F7A]">Background processing — </span>
          )}
          {statusLine}
        </p>
      </div>
    </section>
  );
};

export default VariantPipelineStepper;
