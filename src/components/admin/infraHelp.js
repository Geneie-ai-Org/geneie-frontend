/**
 * Plain-language copy for the infra page. The readers are the founders, not SREs: every
 * section and lever says what it does in one line, with the details collapsed.
 *
 * Costs are rough on-demand figures for orientation, not billing.
 */

export const INTRO = [
  'When an alert email arrives, come here to see what is happening and pull a lever.',
  'Levers here change things for a limited time and go back on their own. Permanent changes (normal worker limits, machine sizes, alarms) are a pull request.',
  'Changes take effect within ~1-2 minutes. Each one asks you to confirm first and is recorded in the audit log at the bottom.',
];

export const SECTION_HELP = {
  alarms: {
    what: 'Alarms firing right now, in plain words, with the card to look at.',
    items: [
      ['When to use', 'Start here after an alert email.'],
      ['What happens', 'Read-only. An alarm clears by itself once the problem stops.'],
    ],
    summary: 'More',
  },
  workers: {
    what: 'ANNOVAR (annotation) and Exomiser (phenotype ranking) run on worker machines that start when jobs arrive and stop when idle.',
    items: [
      ['Queue visible', 'Jobs waiting for a worker.'],
      ['In flight', 'Jobs a worker is processing now.'],
      ['Ledger outstanding', 'Jobs the autoscaler is tracking (submitted, not finished).'],
      ['ASG min / desired / max', 'Lowest allowed number of workers / how many it wants right now / the upper limit.'],
      ['In service / pending', 'Workers running / workers still starting.'],
      ['Warm pool', 'Stopped machines kept ready so a worker can resume in ~1-2 min (warmed = ready, warming = being prepared).'],
      ['Scale-in Lambda', 'The small job that decides every minute how many workers to keep; its last decision is shown.'],
    ],
  },
  module1: {
    what: 'Module-1 (raw reads to variants) runs each job on its own GPU or CPU machine, started by a scheduler on the head box.',
    items: [
      ['Running / cap', 'Jobs running now / the most allowed at once on that lane.'],
      ['Queued', 'Jobs waiting for a free slot.'],
      ['Oldest queued', 'How long the longest-waiting job has waited.'],
      ['GPU capacity', '"Unavailable" means AWS had no GPU machines to give us; jobs fall back to the slower CPU lane.'],
      ['Head box', 'The always-on machine running the scheduler. If it is down, no Module-1 job starts.'],
    ],
  },
  intake: {
    what: 'Stop NEW jobs of one kind for a while. Running jobs finish normally.',
    items: [
      ['When to use', 'During maintenance or an incident, so users get a clear message instead of a failure.'],
      ['What happens', 'Users who submit see "temporarily paused for maintenance, try again after <time>".'],
      ['Cost', 'None.'],
      ['Reverts', 'Automatically at the end time. Resume ends it early.'],
    ],
    summary: 'More',
  },
  dataplane: {
    what: 'The new, faster annotation path (a lookup table + a serverless worker) and which path serves new ANNOVAR jobs. The old path is the default.',
    items: [
      ['Shadow', 'Safe first step: users still get the old result; the new path runs silently and every pair of results is compared.'],
      ['v2', 'The new path serves users. If a job fails there it is re-run once on the old path (while the fall-back is on).'],
      ['Canary accounts', 'Try a path on named accounts (yours) before anyone else gets it.'],
      ['Kill switch', 'Instantly (~45 s) sends every new job back to the old path.'],
      ['Data release', 'Which frozen copy of the annotation databases the new path reads. Switch back to the previous release to undo a bad one.'],
      ['Cost', 'The new path costs cents per job; the old workers still cost what they do today.'],
      ['Reverts', 'No timer: a setting stays until you change it. Reset restores the recorded default (old path).'],
    ],
    summary: 'More',
  },
  ecs: {
    what: 'The always-on services (API, background workers, PGx worker, chat agent). Read-only.',
    items: [
      ['Running / desired', 'Tasks running vs tasks wanted. Fewer than desired for a while usually means a task keeps crashing.'],
      ['Rollout', 'COMPLETED is normal; IN_PROGRESS during a deploy.'],
      ['Min / max', 'Autoscaling limits for the service.'],
      ['Lever', 'None here. A stuck service needs a redeploy or a pull request.'],
    ],
  },
  dlqs: {
    what: 'Jobs that failed several times and were parked so they do not block others.',
    items: [
      ['Visible / in flight', 'Parked jobs (any number above 0 raises an alarm).'],
      ['Last dead letters', 'The most recent parked jobs, with their conversation and the failure reason.'],
      ['What to do', 'Look at the conversation and ask the user to retry. Parked jobs stay until someone deletes or re-sends them (not from this page).'],
    ],
  },
  audit: {
    what: 'Every change made from this page: when, who, what, before → after, and why.',
  },
};

export function floorHelp(meta) {
  return {
    what: 'Starts N workers now and keeps them running for H hours, even when idle.',
    items: [
      ['When to use', 'Before a demo or a batch, or when the queue alarm fires and jobs are waiting.'],
      ['What happens', `Workers come from the warm pool first (ready in ~1-2 min). Beyond the pool, a new ${meta.label} worker needs ~${meta.coldStartMin} min${meta.coldStartWhy ? ` (${meta.coldStartWhy})` : ''}.`],
      ['Cost', `About ${meta.costPerHour}/hour per worker while it runs (approximate).`],
      ['Reverts', 'Automatically at the end time. "Clear" ends it early. N cannot exceed the current max.'],
    ],
  };
}

export function maxRaiseHelp(meta, maxDefault, maxCeiling) {
  const range = maxDefault !== null && maxCeiling !== null ? ` (${maxDefault} → up to ${maxCeiling})` : '';
  return {
    what: `Lets autoscaling go above the normal limit${range} for H hours.`,
    items: [
      ['When to use', 'A big backlog and every worker is already busy.'],
      ['What happens', 'Starts nothing by itself: the system adds one worker per waiting job, up to the new limit.'],
      ['Cost', `Only for workers that actually start, about ${meta.costPerHour}/hour each (approximate).`],
      ['Reverts', 'When the time is up, but it never stops a busy worker: it waits for them to finish (shown as "reverting…"). "End early" asks for the revert now.'],
    ],
  };
}

export const SCALE_IN_HELP = {
  what: 'Stops idle workers immediately and clears any floor. Only possible when the queue is empty.',
  items: [
    ['When to use', 'After a demo or batch, to stop paying for idle workers instead of waiting for the automatic scale-in.'],
    ['What happens', 'Workers go down to the minimum. Refused if a job arrived in the meantime.'],
    ['Cost', 'Saves the idle cost.'],
    ['Reverts', 'Nothing to revert: workers start again by themselves when new jobs arrive.'],
  ],
};

export function capHelp(lane) {
  return {
    what: `How many Module-1 jobs run at once on the ${lane === 'gpu' ? 'GPU' : 'CPU'} lane.`,
    items: [
      ['When to use', 'Jobs are queued and you want them to start now, or you need to limit spend.'],
      ['What happens', 'Raising it starts waiting jobs on new machines within ~2 min. Lowering it never stops running jobs; it only holds back new ones.'],
      ['Cost', lane === 'gpu'
        ? 'Roughly $2.5-5/hour per GPU machine while a job runs (approximate).'
        : 'CPU machines cost less than GPU ones, but jobs take much longer.'],
      ['Reverts', 'With "Revert after" ticked, it goes back to the default at that time (ticked for you when raising above the default). Otherwise it stays until Reset.'],
    ],
  };
}

export const INSTANCE_TYPES_HELP = {
  what: 'Which GPU machine sizes to try, in order, when launching a Module-1 job. Only tested sizes are offered.',
  items: [
    ['When to use', 'GPU capacity shows "Unavailable": adding another size gives AWS more options.'],
    ['What happens', 'The next launch tries the first size, then the next if AWS has none.'],
    ['Cost', 'Bigger sizes cost more per hour (approximate).'],
    ['Reverts', 'No. It stays until you change it or press Reset.'],
  ],
};

export const SUBNETS_HELP = 'Network zones GPU machines may launch in. Read-only; changing them is a pull request.';
