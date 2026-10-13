/**
 * Alarm name → a plain sentence and the card to look at.
 *
 * Mirrors the alarm names in bio-lab-project deploy/terraform/newprod/{alarms.tf,
 * alarms_events.tf, ecs_cluster.tf}. Names are matched by pattern so per-queue / per-service
 * instances are covered; anything unknown falls back to the alarm's own description.
 */

const QUEUE_LABELS = {
  annovar: 'ANNOVAR',
  exomiser: 'Exomiser',
  backend_jobs: 'background',
  'backend-jobs': 'background',
  pgx: 'PGx',
};

const QUEUE_LOOK = {
  annovar: 'Workers → ANNOVAR',
  exomiser: 'Workers → Exomiser',
  backend_jobs: 'ECS services (backend-worker)',
  'backend-jobs': 'ECS services (backend-worker)',
  pgx: 'ECS services (pgx-worker)',
};

const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const RULES = [
  {
    match: /^geneie-newprod-(.+)-queue-oldest-age$/,
    explain: (m) => ({
      text: `${capitalize(QUEUE_LABELS[m[1]] || m[1])} jobs have been waiting ${/backend/.test(m[1]) ? 5 : 15} min with no worker picking them up. Workers are not starting or not consuming.`,
      look: QUEUE_LOOK[m[1]] || 'Workers',
    }),
  },
  {
    match: /^geneie-newprod-(.+)-dlq-not-empty$/,
    explain: (m) => ({
      text: `A ${QUEUE_LABELS[m[1]] || m[1]} job failed several times and was parked. It stays there until someone deals with it.`,
      look: 'Dead-letter queues',
    }),
  },
  {
    match: /^geneie-newprod-gpu-vcpu-quota-80pct$/,
    explain: () => ({
      text: 'GPU machines in use are above 80% of our AWS account limit. New GPU jobs may soon fail to start.',
      look: 'Module-1 (consider lowering the GPU cap)',
    }),
  },
  {
    match: /^geneie-newprod-module1-oldest-queued-30min$/,
    explain: () => ({
      text: 'A Module-1 job has waited more than 30 min to start: the GPU lane is full, AWS has no GPUs, or the scheduler is down.',
      look: 'Module-1 (cap, GPU capacity, head box)',
    }),
  },
  {
    match: /^geneie-newprod-module1-poller-heartbeat$/,
    explain: () => ({
      text: 'The Module-1 scheduler has gone quiet for 15 min, so no Module-1 job is being started.',
      look: 'Module-1 → Head box',
    }),
  },
  {
    match: /^geneie-newprod-module1-gpu-capacity-unavailable$/,
    explain: () => ({
      text: 'AWS has had no GPU machines for us for 15 min. Jobs are falling back to the slow CPU lane.',
      look: 'Module-1 → GPU instance types (add another size)',
    }),
  },
  {
    match: /^geneie-newprod-api-(5xx|alb-5xx)$/,
    explain: () => ({
      text: 'The API is returning server errors to users (overloaded or a bad deploy).',
      look: 'ECS services (backend-prod)',
    }),
  },
  {
    match: /^geneie-newprod-api-latency-p95$/,
    explain: () => ({
      text: 'The API has been slow (over 20 s for the slowest 5% of requests) for 10 min.',
      look: 'ECS services (backend-prod)',
    }),
  },
  {
    match: /^geneie-newprod-api-unhealthy-targets$/,
    explain: () => ({
      text: 'At least one API task has failed its health check for 5 min.',
      look: 'ECS services (backend-prod)',
    }),
  },
  {
    match: /^geneie-newprod-(.+)-no-healthy-targets$/,
    explain: (m) => ({
      text: `The ${m[1]} service has had no healthy task for 3 min: it is down for users.`,
      look: 'ECS services',
    }),
  },
  {
    match: /^geneie-newprod-ecs-(.+)-running-below-desired$/,
    explain: (m) => ({
      text: `The ${m[1]} service has had fewer tasks running than wanted for 10 min (crashing, failing health checks, or cannot start).`,
      look: `ECS services (${m[1]})`,
    }),
  },
  {
    match: /^geneie-newprod-ecs-task-crashed$/,
    explain: () => ({
      text: 'A service task crashed (error exit or out of memory).',
      look: 'ECS services',
    }),
  },
  {
    match: /^geneie-newprod-asg-launch-failed$/,
    explain: () => ({
      text: 'AWS could not start a worker machine. Jobs may be waiting for a worker that never comes.',
      look: 'Workers (last scaling activities)',
    }),
  },
  {
    match: /^geneie-newprod-(.+)-cpu-high$/,
    explain: (m) => (m[1] === 'docdb'
      ? { text: 'The document database has been busy (CPU over 80%) for 10 min.', look: 'No lever here (database)' }
      : m[1] === 'redis-engine'
        ? { text: 'The Redis cache (quotas, locks) has been busy for 10 min.', look: 'No lever here (cache)' }
        : { text: `The ${m[1]} service has been busy (CPU over 80%) for 10 min even after autoscaling.`, look: 'ECS services' }),
  },
  {
    match: /^geneie-newprod-(.+)-memory-high$/,
    explain: (m) => ({
      text: `The ${m[1]} service has used over 85% of its memory for 10 min; tasks may be killed.`,
      look: 'ECS services',
    }),
  },
  {
    match: /^geneie-newprod-redis-engine-cpu-high$/,
    explain: () => ({ text: 'The Redis cache (quotas, locks) has been busy for 10 min.', look: 'No lever here (cache)' }),
  },
  {
    match: /^geneie-newprod-docdb-freeable-memory-low$/,
    explain: () => ({ text: 'The document database is short of memory: expect slow queries.', look: 'No lever here (database)' }),
  },
  {
    match: /^geneie-newprod-(.+)-cpu-credits-low$/,
    explain: (m) => ({ text: `The ${m[1]} database is about to be slowed down (burst credits nearly used up).`, look: 'No lever here (database)' }),
  },
  {
    match: /^geneie-newprod-(.+)-connections-high$/,
    explain: (m) => ({ text: `The ${m[1]} database has an unusually high number of connections.`, look: 'No lever here (database)' }),
  },
  {
    match: /^geneie-newprod-(.+)-free-storage-low$/,
    explain: (m) => ({ text: `The ${m[1]} database has less than 15 GB of disk left.`, look: 'No lever here (database)' }),
  },
  {
    match: /^geneie-newprod-bedrock-throttles-(.+)$/,
    explain: (m) => ({
      text: `The AI model ${m[1]} is rate-limiting us. Retries absorb it, but chat may be slower.`,
      look: 'No lever here (needs an AWS quota increase)',
    }),
  },
];

/** `{ text, look }` for a known alarm, else the alarm's own description. */
export function explainAlarm(name, description) {
  for (const rule of RULES) {
    const m = String(name || '').match(rule.match);
    if (m) return rule.explain(m);
  }
  return { text: description || null, look: null };
}
